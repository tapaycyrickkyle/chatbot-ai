import Link from "next/link";

const SignInFooter = () => {
  return (
    <footer className="mt-auto flex w-full flex-col items-center justify-between gap-3 border-t border-[#2a2a2a] bg-[#171717] px-4 py-4 text-center md:flex-row md:gap-4 md:px-10 md:py-5">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:gap-6">
        <Link
          className="text-[12px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f] md:text-[13px]"
          href="/privacy-policy"
        >
          Privacy Policy
        </Link>
        <Link
          className="text-[12px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f] md:text-[13px]"
          href="/data-deletion"
        >
          Data Deletion
        </Link>
        <Link
          className="text-[12px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f] md:text-[13px]"
          href="/terms-of-service"
        >
          Terms of Service
        </Link>
      </div>
      <div className="text-[12px] text-[#a1a1aa] md:text-[13px]">
        &copy; 2026 AI Inbox. All rights reserved.
      </div>
    </footer>
  );
};

export default SignInFooter;
