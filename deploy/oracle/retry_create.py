"""Keep trying to create the Always Free Ampere A1 server until Oracle has capacity.

Uses ~/.oci/config (API key). Free-tier safe: VM.Standard.A1.Flex within the
Always Free allowance (4 OCPU / 24 GB total), 50 GB boot volume.

    ~/.oci/venv/bin/python deploy/oracle/retry_create.py            # 1 OCPU / 6 GB
    OCPUS=2 MEM=12 ~/.oci/venv/bin/python deploy/oracle/retry_create.py

Prints the public IP and exits once the instance is RUNNING.
"""
import os
import sys
import time
from pathlib import Path

import oci

NAME = os.environ.get("NAME", "cxr-rrg")
OCPUS = float(os.environ.get("OCPUS", "1"))
MEM = float(os.environ.get("MEM", "6"))
VCN_NAME = os.environ.get("VCN_NAME", "cxr-rrg-vcn")
SSH_KEY = Path(os.environ.get("SSH_PUB", "~/.ssh/oracle_cxr.pub")).expanduser().read_text().strip()
WAIT = int(os.environ.get("WAIT", "60"))

cfg = oci.config.from_file()
tenancy = cfg["tenancy"]
idn = oci.identity.IdentityClient(cfg)
net = oci.core.VirtualNetworkClient(cfg)
comp = oci.core.ComputeClient(cfg)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def existing():
    for i in comp.list_instances(tenancy, display_name=NAME).data:
        if i.lifecycle_state not in ("TERMINATED", "TERMINATING"):
            return i
    return None


def public_subnet():
    vcns = [v for v in net.list_vcns(tenancy).data if v.display_name == VCN_NAME and v.lifecycle_state == "AVAILABLE"]
    if not vcns:
        sys.exit(f"VCN {VCN_NAME!r} not found")
    for s in net.list_subnets(tenancy, vcn_id=vcns[0].id).data:
        if not s.prohibit_public_ip_on_vnic:
            return s
    sys.exit(f"No public subnet in {VCN_NAME}")


def ubuntu_image():
    imgs = comp.list_images(tenancy, operating_system="Canonical Ubuntu", operating_system_version="24.04",
                            shape="VM.Standard.A1.Flex", sort_by="TIMECREATED", sort_order="DESC").data
    imgs = [i for i in imgs if "Minimal" not in i.display_name]
    return imgs[0]


def public_ip(inst):
    for att in comp.list_vnic_attachments(tenancy, instance_id=inst.id).data:
        v = net.get_vnic(att.vnic_id).data
        if v.public_ip:
            return v.public_ip
    return None


def wait_running(inst):
    while inst.lifecycle_state != "RUNNING":
        log("state:", inst.lifecycle_state)
        time.sleep(15)
        inst = comp.get_instance(inst.id).data
    ip = None
    while not ip:
        ip = public_ip(inst)
        if not ip:
            time.sleep(5)
    log("RUNNING", "public IP:", ip)
    print("PUBLIC_IP=" + ip, flush=True)


def main():
    inst = existing()
    if inst:
        log("instance already exists:", inst.lifecycle_state)
        return wait_running(inst)

    subnet = public_subnet()
    image = ubuntu_image()
    ads = [a.name for a in idn.list_availability_domains(tenancy).data]
    log(f"subnet={subnet.display_name} image={image.display_name} ADs={ads} shape=A1 {OCPUS} OCPU/{MEM} GB")

    attempt = 0
    while True:
        for ad in ads:
            attempt += 1
            details = oci.core.models.LaunchInstanceDetails(
                availability_domain=ad,
                compartment_id=tenancy,
                display_name=NAME,
                shape="VM.Standard.A1.Flex",
                shape_config=oci.core.models.LaunchInstanceShapeConfigDetails(ocpus=OCPUS, memory_in_gbs=MEM),
                source_details=oci.core.models.InstanceSourceViaImageDetails(image_id=image.id, boot_volume_size_in_gbs=50),
                create_vnic_details=oci.core.models.CreateVnicDetails(subnet_id=subnet.id, assign_public_ip=True),
                metadata={"ssh_authorized_keys": SSH_KEY},
            )
            try:
                inst = comp.launch_instance(details).data
                log(f"attempt {attempt}: CREATED in {ad}")
                return wait_running(inst)
            except oci.exceptions.ServiceError as e:
                msg = (e.message or "").split(".")[0]
                log(f"attempt {attempt} ({ad}): {e.status} {msg}")
                if e.status in (400, 401, 404) and "capacity" not in (e.message or "").lower():
                    raise
        time.sleep(WAIT)


if __name__ == "__main__":
    while True:
        try:
            main()
            break
        except oci.exceptions.ServiceError as e:
            if e.status not in (401, 429, 500, 502, 503):
                raise
            log(f"temporary error {e.status} ({e.code}); retrying in 30s")  # new API keys take a few minutes to activate
            time.sleep(30)
        except oci.exceptions.RequestException as e:
            log("network error:", e, "; retrying in 30s")
            time.sleep(30)
