import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import App from "./App";
import Repositories from "./screens/Repositories";
import DemoGate from "./screens/DemoGate";
import "./styles.css";
import "./studio.css";
import "./examples.css";
import "./repositories.css";

function Root() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const demo = [
    "incident",
    "examples",
    "context",
    "decisions",
    "connections",
  ].includes(hash.slice(1).split("/")[0]);
  return demo ? <App /> : <Repositories />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DemoGate>
      <Root />
    </DemoGate>
  </React.StrictMode>,
);
