import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CaptureApp from "./windows/CaptureApp";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const isCapture = params.get("window") === "capture";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isCapture ? <CaptureApp /> : <App />}</React.StrictMode>,
);
