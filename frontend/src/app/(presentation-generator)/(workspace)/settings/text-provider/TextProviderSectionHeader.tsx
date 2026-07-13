import React from "react";

const TextProviderSectionHeader = () => {
  return (
    <div className="max-w-[290px] shrink-0 ">
      <div
        className="flex h-[60px] w-[60px] items-center justify-center rounded-[4px]"
        style={{ backgroundColor: "#4C55541A" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
        >
          <path
            d="M15.9459 5.31543V26.5767"
            stroke="#4C5554"
            strokeWidth="1.59459"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.31531 9.30192V6.64426C5.31531 6.29183 5.45531 5.95384 5.70451 5.70463C5.95372 5.45543 6.29171 5.31543 6.64414 5.31543H25.2477C25.6002 5.31543 25.9382 5.45543 26.1874 5.70463C26.4366 5.95384 26.5766 6.29183 26.5766 6.64426V9.30192"
            stroke="#4C5554"
            strokeWidth="1.59459"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M11.9594 26.5762H19.9324"
            stroke="#4C5554"
            strokeWidth="1.59459"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="py-2.5 text-xl font-normal text-[#191919]">
        Text Generation Settings
      </h3>
      <p className="text-sm text-gray-500">
        Choosing where text content comes from
      </p>
    </div>
  );
};

export default TextProviderSectionHeader;

