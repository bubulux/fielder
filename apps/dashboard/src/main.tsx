import { render } from "preact";
// Design system (tokens + component classes, copied from the Fielder design system); styles.css holds the layouts.
import "./design/colors.css";
import "./design/typography.css";
import "./design/spacing.css";
import "./design/actions.css";
import "./design/navigation.css";
import "./design/forms.css";
import "./design/overlays.css";
import "./design/data.css";
import "./design/feedback.css";
import "./design/fielder.css";
import "./design/dashboard.css";
import "./styles.css";
import { App } from "./App";

render(<App />, document.getElementById("app")!);
