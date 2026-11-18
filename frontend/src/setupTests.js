import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// react-router v7 needs these in the jsdom test environment
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// jsdom lacks these browser APIs used by the UI
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
