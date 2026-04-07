import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faUsers } from "@fortawesome/free-solid-svg-icons";

const iconClassName = "h-5 w-5";

type DashboardIconProps = {
  type: "clients" | "account";
};

const DashboardIcon = ({ type }: DashboardIconProps) => {
  const icon = type === "clients" ? faUsers : faGear;

  return <FontAwesomeIcon aria-hidden="true" className={iconClassName} icon={icon} />;
};

export default DashboardIcon;
