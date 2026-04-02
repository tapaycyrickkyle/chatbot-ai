const iconClassName = "h-5 w-5";

type DashboardIconProps = {
  type: "clients" | "account";
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
        d="m10.5 4.75 1.01-1.25a.63.63 0 0 1 .98 0l1.01 1.25a1.5 1.5 0 0 0 1.58.48l1.52-.47a.63.63 0 0 1 .78.6l.08 1.61a1.5 1.5 0 0 0 .91 1.37l1.48.64a.63.63 0 0 1 .25.92l-.93 1.32a1.5 1.5 0 0 0 0 1.74l.93 1.32a.63.63 0 0 1-.25.92l-1.48.64a1.5 1.5 0 0 0-.91 1.37l-.08 1.61a.63.63 0 0 1-.78.6l-1.52-.47a1.5 1.5 0 0 0-1.58.48l-1.01 1.25a.63.63 0 0 1-.98 0l-1.01-1.25a1.5 1.5 0 0 0-1.58-.48l-1.52.47a.63.63 0 0 1-.78-.6l-.08-1.61a1.5 1.5 0 0 0-.91-1.37l-1.48-.64a.63.63 0 0 1-.25-.92l.93-1.32a1.5 1.5 0 0 0 0-1.74l-.93-1.32a.63.63 0 0 1 .25-.92l1.48-.64a1.5 1.5 0 0 0 .91-1.37l.08-1.61a.63.63 0 0 1 .78-.6l1.52.47a1.5 1.5 0 0 0 1.58-.48Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z"
      />
    </svg>
  );
};

export default DashboardIcon;
