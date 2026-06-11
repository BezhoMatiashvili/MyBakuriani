import type { LegalDoc } from "./types";

export const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  lastUpdated: "Last updated: 18-05-2026",
  intro:
    "This Policy describes how the Platform collects, uses, processes, and protects users' personal data.",
  sections: [
    {
      id: "data-controller",
      title: "1. Data Controller",
      body: "The controller of your personal data is:",
      bullets: [
        "Individual Entrepreneur: Luka Matiashvili",
        "Legal address: Khomli St. 11g",
        "Email: privacy@mybakuriani.ge",
      ],
    },
    {
      id: "data-we-collect",
      title: "2. What Data We Collect",
      subsections: [
        {
          id: "registration-data",
          title: "2.1. Registration Data",
          bullets: ["Name;", "Phone number;", "Authorization information."],
        },
        {
          id: "verification-data",
          title: "2.2. Verification Data",
          body: "For property owners:",
          bullets: [
            "Cadastral code;",
            "Proof of ownership information;",
            "Additional documents where necessary.",
          ],
        },
        {
          id: "technical-data",
          title: "2.3. Technical Data",
          bullets: [
            "IP address;",
            "Device data;",
            "Browser information;",
            "Logs;",
            "Session data.",
          ],
        },
        {
          id: "behavioral-data",
          title: "2.4. Behavioral Data",
          bullets: [
            "Favorites;",
            "Listing views;",
            "Clicks on contact buttons;",
            "Activity on the Platform.",
          ],
        },
      ],
    },
    {
      id: "processing-purposes",
      title: "3. Purposes of Data Processing",
      body: "Data is processed for the following purposes:",
      bullets: [
        "Account management;",
        "Security;",
        "Anti-Fraud monitoring;",
        "Smart Match;",
        "AI functionality;",
        "Customer support;",
        "Payment administration;",
        "Statistics and analytics;",
        "Direct marketing (only with consent).",
      ],
    },
    {
      id: "cookies",
      title: "4. Cookies Policy",
      body: "The Platform uses:",
      bullets: [
        "Essential Cookies — for authorization and security;",
        "Analytics Cookies — for statistics and behavior analysis;",
        "Marketing Cookies — for personalized offers and advertising.",
      ],
      subsections: [
        {
          id: "cookies-note",
          body: "Users may restrict the use of Cookies through their browser settings; however, this may affect the functionality of the Platform.",
        },
      ],
    },
    {
      id: "data-sharing",
      title: "5. Data Sharing",
      body: "We do not sell personal data.\nData may be shared with:",
      bullets: [
        "Payment providers;",
        "Hosting and IT service providers;",
        "SMS/Email services;",
        "State authorities in cases provided for by law.",
      ],
    },
    {
      id: "data-retention",
      title: "6. Data Retention Period",
      body: "Personal data is retained:",
      bullets: [
        "For the period the account remains active;",
        "For the periods established by law;",
        "For the purposes of dispute prevention and financial record-keeping.",
      ],
      subsections: [
        {
          id: "retention-note",
          body: "Certain records may be retained for a period of 3-6 years.",
        },
      ],
    },
    {
      id: "user-rights",
      title: "7. User Rights",
      body: "The user has the right to:",
      bullets: [
        "Receive information;",
        "Request rectification;",
        "Request erasure;",
        "Restrict processing;",
        "Withdraw consent to marketing.",
      ],
      subsections: [
        {
          id: "rights-contact",
          body: "Requests must be sent to: privacy@mybakuriani.ge",
        },
      ],
    },
    {
      id: "security-measures",
      title: "8. Security Measures",
      body: "The Platform uses:",
      bullets: [
        "SSL/TLS encryption;",
        "Secure hosting;",
        "Access control;",
        "Anti-Fraud monitoring;",
        "Technical and organizational security measures.",
      ],
      subsections: [
        {
          id: "security-note",
          body: "Nevertheless, the transmission of information over the internet cannot be entirely secure.",
        },
      ],
    },
    {
      id: "policy-changes",
      title: "9. Changes to the Policy",
      body: "The Platform is entitled to update this Policy periodically.",
    },
  ],
};
