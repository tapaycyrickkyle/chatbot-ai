import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faUserTie, faUsers } from "@fortawesome/free-solid-svg-icons";

const iconClassName = "h-5 w-5";

type DashboardIconProps = {
  type: "clients" | "account" | "owners";
};

const DashboardIcon = ({ type }: DashboardIconProps) => {
  const icon = type === "clients" ? faUsers : type === "owners" ? faUserTie : faGear;

  return <FontAwesomeIcon aria-hidden="true" className={iconClassName} icon={icon} />;
};

export default DashboardIcon;
