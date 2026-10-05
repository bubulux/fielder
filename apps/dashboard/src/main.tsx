import { render } from "preact";
// Design system: tokens + component classes are imported by the component library (./ui); styles.css holds the layouts.
import "./ui";
import "./styles.css";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
