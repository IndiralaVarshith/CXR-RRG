import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import "./legal.css";

const UPDATED = "28 November 2026";
const CONTACT = "the project's GitHub page (github.com/IndiralaVarshith/CXR-RRG)";

function Shell({ title, children }) {
  return (
    <div className="legal">
      <header className="legal-top container">
        <Logo />
        <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
      </header>
      <main className="container legal-body panel panel-pad">
        <span className="eyebrow">Legal</span>
        <h1>{title}</h1>
        <p className="faint">Last updated {UPDATED}</p>
        {children}
        <p className="legal-links">
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/terms">Terms of Service</Link>
        </p>
      </main>
    </div>
  );
}

export function Privacy() {
  return (
    <Shell title="Privacy Policy">
      <p>
        CXR-RRG is a research and educational tool that screens chest X-ray images with AI. This policy explains what we
        collect and how it is used.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> your name and email address. If you sign in with Google, we receive only your name,
          email address and Google account ID (no password, contacts or other data).</li>
        <li><b>Password:</b> stored only as a salted bcrypt hash; nobody can read it.</li>
        <li><b>Reports you save:</b> the X-ray image, patient name/reference and notes you type, and the AI results.</li>
        <li><b>Sign-in sessions:</b> browser and operating system type, approximate network address and times, so you can
          see and sign out your devices.</li>
      </ul>
      <h2>How it is used</h2>
      <ul>
        <li>To sign you in, keep your account secure and show you your own reports.</li>
        <li>Images you analyze are sent to our AI service only to produce results. Unsaved images are not stored.</li>
        <li>We do not sell data, show ads, or use your data to train models.</li>
      </ul>
      <h2>Who can see your data</h2>
      <p>
        Only you can see your reports and devices. A designated doctor account can review all reports. Data is stored with
        our hosting providers (MongoDB Atlas, Render, Modal) solely to run the service.
      </p>
      <h2>Your choices</h2>
      <p>
        You can delete any report, or all of them, from the History page, and sign out any device from the Security page.
        To delete your account, contact us via {CONTACT}.
      </p>
      <h2>Medical disclaimer</h2>
      <p>CXR-RRG is not a medical device. Do not upload images unless you are allowed to share them.</p>
    </Shell>
  );
}

export function Terms() {
  return (
    <Shell title="Terms of Service">
      <p>By creating an account or using CXR-RRG you agree to these terms.</p>
      <h2>Not medical advice</h2>
      <p>
        CXR-RRG is a research and educational screening aid. Its results can be wrong and must be reviewed by a qualified
        clinician. It must not be used as the sole basis for any diagnosis or treatment decision.
      </p>
      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your password private; you are responsible for activity on your account.</li>
        <li>Only upload images you have the right to use, and remove identifying patient details where required.</li>
        <li>Do not attempt to break, overload, scrape or misuse the service or other users' data.</li>
      </ul>
      <h2>Availability</h2>
      <p>
        The service is provided free and "as is", without warranties. It may be slow, unavailable or changed at any time,
        and accounts that misuse it may be suspended.
      </p>
      <h2>Liability</h2>
      <p>To the extent permitted by law, the project's authors are not liable for any loss arising from use of the service.</p>
      <h2>Contact</h2>
      <p>Questions: {CONTACT}.</p>
    </Shell>
  );
}
