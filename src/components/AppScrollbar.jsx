import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

export default function AppScrollbar({ children, className = "", style, ...props }) {
  return (
    <SimpleBar className={className} style={style} autoHide={false} {...props}>
      {children}
    </SimpleBar>
  );
}
