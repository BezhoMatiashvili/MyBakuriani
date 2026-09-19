import type { LegalDoc } from "./types";

export const marketingEn: LegalDoc = {
  title: "Direct Marketing Policy",
  lastUpdated: "Last updated: 09-09-2026",
  intro:
    "This Policy sets out the rules under which MyBakuriani sends marketing, advertising, and other promotional communications, the mechanisms for a user's consent and withdrawal of consent, and the distinction between transactional and marketing communications.",
  sections: [
    {
      id: "transactional-vs-marketing",
      title: "1. Distinguishing Transactional and Marketing Messages",
      subsections: [
        {
          id: "transactional",
          title: "1.1. Transactional/Service Messages",
          body: "Transactional or service messages are messages that are necessary for a user to use the relevant function of the Platform, for account security, to perform an operation, or to provide a service requested by the user.",
          bullets: [
            "Authorization and security codes (OTP);",
            "Account-related security alerts;",
            "Notices of the status or confirmation of an operation requested by the user;",
            "Notices relating to a Smart Match/request result triggered by the user, where they are part of the relevant service function;",
            "Other necessary technical or service notices.",
          ],
        },
        {
          id: "transactional-note",
          body: "Such messages are not used for marketing purposes. Receiving them may be necessary to ensure the relevant function or account security.",
        },
        {
          id: "marketing",
          title: "1.2. Marketing Messages",
          body: "Marketing messages include advertising of MyBakuriani, its services, or offers, promotions, discounts, promo codes, advertising of new features, and other communications of a commercial nature.\n\nA request for a user to leave a rating/review may be considered marketing or advertising communication if its purpose is solely to promote the service or to achieve a commercial result; in such a case it will be subject to the rules governing marketing communication.",
        },
      ],
    },
    {
      id: "consent-channels",
      title: "2. Consent (Opt-in) and Communication Channels",
      body: "When carrying out direct marketing, MyBakuriani acts in accordance with the requirements of applicable law. Where consent is required for direct marketing, that consent is obtained in advance, on the basis of a specific and informed choice.\n\nA user may be given the option to choose one or more communication channels, including:",
      bullets: [
        "SMS;",
        "Email;",
        "WhatsApp;",
        "Browser push notifications;",
        "Other digital communication channels that MyBakuriani may use in the future.",
      ],
      subsections: [
        {
          id: "consent-channels-note",
          body: "If a user selects a specific channel, marketing messages must be sent through the channel(s) for which the user has recorded the corresponding choice or consent.",
        },
      ],
    },
    {
      id: "consent-records",
      title: "3. Confirmation and Recording of Consent",
      body: "MyBakuriani retains the information necessary to confirm and manage marketing consent, including, to the extent reasonably possible: the status of consent, the channel, the time consent was obtained, and the source/mechanism of consent.\n\nRecords confirming consent are retained for as long as necessary to manage marketing consent and confirm its lawfulness, in accordance with the applicable data-retention rules.",
    },
    {
      id: "opt-out",
      title: "4. The Right to Withdraw Consent (Opt-out)",
      body: "A user has the right, at any time, to request that direct marketing be stopped. Withdrawal must be simple, free of charge, and accessible.\n\nWithdrawal is possible, including through:",
      bullets: [
        "Changing the relevant setting in the personal dashboard;",
        "The Unsubscribe mechanism included in a marketing email;",
        "The STOP instruction, or another relevant instruction, indicated in an SMS message, where such a mechanism is used;",
        "Sending a request to MyBakuriani at: info.mybakuriani@gmail.com.",
      ],
      subsections: [
        {
          id: "opt-out-note",
          body: "A user's withdrawal from marketing must not result in the cancellation of the account or of services that are available independently of marketing, except where a specific communication is objectively necessary to provide the relevant service.",
        },
      ],
    },
    {
      id: "opt-out-processing",
      title: "5. Processing a Withdrawal Request",
      body: "After receiving a request to stop marketing communication, MyBakuriani takes reasonable and appropriate technical measures so that the user's data is no longer used for direct marketing.\n\nDue to technical synchronization or an already-scheduled message, an individual message may still be received while the request is being processed; however, MyBakuriani seeks to avoid such cases. A withdrawal request is fulfilled within the periods provided by law.",
    },
    {
      id: "transactional-separation",
      title: "6. Separation from Transactional Messages",
      body: "Opting out of marketing does not automatically mean that necessary transactional or service messages are disabled. Such messages may continue, but only to the extent necessary to provide the account, security, or a service requested by the user.\n\nWhere a single message combines service and marketing information, MyBakuriani will, to the extent feasible, separate them and, for the marketing portion, comply with the requirements provided by applicable law.",
    },
    {
      id: "third-party-offers",
      title: "7. Third-Party and Partner Offers",
      body: "If MyBakuriani sends a user an offer from a third party or partner, such communication will be carried out in accordance with applicable law and, where necessary, on the basis of the corresponding marketing consent.\n\nThe transfer of a user's personal data for the benefit of a third party is not automatically considered permitted merely because the user has consented to marketing. Any such transfer will be carried out only in compliance with the relevant legal basis and data-protection requirements.",
    },
    {
      id: "data-processing",
      title: "8. Processing of Personal Data",
      body: "The processing of personal data related to marketing is carried out in accordance with MyBakuriani's Privacy Policy and applicable law.\n\nA user may request information regarding their marketing consent, change their choice of channel, or withdraw the relevant consent in the manner established by law.",
    },
    {
      id: "policy-changes",
      title: "9. Changes to This Policy",
      body: "MyBakuriani is entitled to periodically update this Direct Marketing Policy, including due to new communication channels, technologies, or changes in applicable law. An updated version will be published on the Platform with the corresponding date.",
    },
    {
      id: "contact-info",
      title: "10. Contact Information",
      bullets: [
        "Email: info.mybakuriani@gmail.com",
        "MyBakuriani: mybakuriani.ge / mybakuriani.com.ge / mybakuriani.com",
      ],
      subsections: [
        {
          id: "contact-info-note",
          body: "This Policy must be read together with MyBakuriani's Terms of Use and Privacy Policy.",
        },
      ],
    },
  ],
};
