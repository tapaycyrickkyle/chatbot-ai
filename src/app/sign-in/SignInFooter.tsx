const SignInFooter = () => {
  return (
    <footer className="mt-auto hidden w-full flex-col items-center justify-between gap-4 border-t border-[#2a2a2a] bg-[#171717] px-6 py-5 text-center md:flex md:flex-row md:px-10">
      <div className="flex flex-wrap items-center justify-center gap-6">
        <a
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="#"
        >
          Privacy Policy
        </a>
        <a
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="#"
        >
          Terms of Service
        </a>
        <a
          className="text-[13px] text-[#a1a1aa] transition-colors hover:text-[#3aa06f]"
          href="#"
        >
          Security
        </a>
      </div>
      <div className="text-[13px] text-[#a1a1aa]">
        (c) 2026 Chatbot AI. All rights reserved.
      </div>
    </footer>
  );
};

export default SignInFooter;
