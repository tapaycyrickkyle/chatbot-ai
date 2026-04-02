const iconClassName = "h-5 w-5";

type DashboardIconProps = {
  type: "clients";
};

const DashboardIcon = ({ type }: DashboardIconProps) => {
  if (type === "clients") {
    return (
      <svg
        aria-hidden="true"
        className={iconClassName}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1m18 0v-1a4 4 0 0 0-3-3.87M16 5.13a4 4 0 1 1 0 7.75M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
        />
      </svg>
    );
  }

  return null;
};

export default DashboardIcon;
