import Link from "next/link";

const SignInFooter = () => {
  return (
    <footer className="mt-auto hidden w-full flex-col items-center justify-between gap-4 border-t border-[#2a2a2a] bg-[#171717] px-6 py-5 text-center md:flex md:flex-row md:px-10">
      <div className="flex flex-wrap items-center justify-center gap-6">
        <Link
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="/privacy-policy"
        >
          Privacy Policy
        </Link>
        <Link
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="/data-deletion"
        >
          Data Deletion
        </Link>
        <Link
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="/terms-of-service"
        >
          Terms of Service
        </Link>
      </div>
      <div className="text-[13px] text-[#a1a1aa]">
        &copy; 2026 Business Chatbot. All rights reserved.
      </div>
    </footer>
  );
};

export default SignInFooter;
