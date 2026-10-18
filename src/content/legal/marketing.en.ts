import type { LegalDoc } from "./types";

// Direct Marketing Policy v2 (MyBakuriani_Direct_Marketing_Policy_Final_v2_2026.docx).
// ka is authoritative; en/ru are translations. Section ids are shared across locales.
export const marketingEn: LegalDoc = {
  title: "Direct Marketing Policy",
  lastUpdated: "Last updated: 23-09-2026",
  intro:
    "This Policy sets out the rules under which MyBakuriani sends marketing, advertising and other commercial messages, the mechanisms for a user to give and refuse consent, and the rules for distinguishing transactional/service communications from marketing communications. This Policy must be read together with MyBakuriani's Terms of Use and Privacy Policy.",
  sections: [
    {
      id: "general",
      title: "1. General Provisions",
      body: "1.1. This Direct Marketing Policy sets out the rules under which MyBakuriani communicates with users for direct marketing purposes, including through SMS, email, WhatsApp, push notifications and other relevant electronic communication channels.\n\n1.2. This Policy sets out: (a) the distinction between transactional/service and marketing communications; (b) the procedure for obtaining consent to direct marketing; (c) the procedure for a user to withdraw consent and opt out of marketing; (d) the procedure for recording consent and its withdrawal; (e) the procedure for delivering offers from listing authors, partners and other commercial offers to users; (f) the core principles of processing personal data in the course of marketing communications.\n\n1.3. This Policy must be read together with MyBakuriani's Terms of Use and Privacy Policy.\n\n1.4. When carrying out direct marketing, MyBakuriani acts in accordance with the applicable legislation of Georgia.",
    },
    {
      id: "transactional-vs-marketing",
      title: "2. Distinguishing Transactional and Marketing Messages",
      subsections: [
        {
          id: "transactional",
          title: "2.1. Transactional/Service Messages",
          body: "A transactional or service message is a communication that is necessary for the user to use the relevant Platform feature, for account security, to complete an operation, or to provide a service requested by the user.",
          bullets: [
            "Authorization and security codes (OTP);",
            "Account-related security notifications;",
            "The status or confirmation of an operation requested by the user;",
            "Notifications about a Smart Match request, response or result, where this is part of the relevant feature;",
            "Notifications related to a booking request;",
            "Notifications about a visit or other service requested by the user;",
            "Check-in reminders;",
            "Reminders related to the performance of a service requested by the user;",
            "Notifications related to a listing or to a request made by the user;",
            "Other necessary technical or service notifications.",
          ],
        },
        {
          id: "transactional-note",
          body: "Such messages are not used for direct marketing purposes and may be sent to the extent necessary to provide the relevant service or feature.",
        },
        {
          id: "marketing",
          title: "2.2. Marketing Messages",
          body: "A marketing message is any information delivered to a user for the purpose of promoting MyBakuriani, the author of a listing published on the Platform, a partner, or any other commercial offer.\n\nMarketing messages may include discounts, special offers, promotions, promo codes, promotional information about new listings, special terms offered by a listing author, MyBakuriani's paid or other services, commercial information about new features or products, and other offers of a commercial nature.\n\nA request for the user to leave a rating or review is, as a rule, a service communication where its purpose is to obtain the user's assessment of a service they received. If such a communication contains an element of direct marketing or promotes a commercial offer, it is subject to the rules on marketing communications.",
        },
      ],
    },
    {
      id: "opt-in",
      title: "3. Consent to Direct Marketing (Opt-in)",
      body: "3.1. Personal data is processed for direct marketing purposes on the basis of the user's consent, where such consent is required by law.\n\n3.2. Consent is obtained in advance, and the user must have a genuine opportunity to freely choose whether or not they wish to receive direct marketing.\n\n3.3. Marketing consent must not be pre-selected.\n\n3.4. The user may be given the option to choose a specific communication channel or channels: SMS; email; WhatsApp; push; another relevant electronic communication channel.\n\n3.5. If the user gives consent only for a specific communication channel, marketing communication will be carried out only through the channel for which the relevant consent has been recorded.\n\n3.6. The text of the marketing consent must be presented to the user in a clear, simple and understandable form.",
    },
    {
      id: "author-offers",
      title: "4. Offers from MyBakuriani and Listing Authors",
      body: "4.1. Where the user has given the relevant marketing consent, MyBakuriani may provide the user with information about special offers, discounts, special terms and other commercial offers from the authors of listings published on the Platform.\n\n4.2. Such an offer may be related to an interest or request the user has recorded on the Platform.\n\n4.3. This communication may be carried out through MyBakuriani's communication channels, including SMS, email, WhatsApp or push notification.\n\n4.4. Delivering a listing author's offer to the user does not mean that MyBakuriani is the owner, landlord, seller, buyer, agency, broker or any other party to a transaction concerning the relevant real estate.\n\n4.5. The terms, price, availability and other transaction conditions of the relevant offer are determined between the relevant listing author and the user.",
    },
    {
      id: "third-party-data",
      title: "5. Protection of Personal Data with Respect to Third Parties",
      body: "5.1. A user's consent to marketing does not automatically mean that MyBakuriani is entitled to transfer the user's personal data to a listing author, partner or other third party.\n\n5.2. Personal data will be transferred to a third party only where there is an appropriate legal basis and in compliance with the requirements of personal data protection legislation.\n\n5.3. Where it is possible to deliver the relevant offer to the user without transferring their personal data to the listing author, MyBakuriani is entitled to use such a model.",
    },
    {
      id: "consent-records",
      title: "6. Recording Consent",
      body: "6.1. MyBakuriani takes appropriate technical and organizational measures to be able to demonstrate the existence of direct marketing consent.\n\n6.2. To the extent possible, the following are recorded: the user identifier; the consent status; the communication channel; the date and time consent was given; the source/mechanism of consent; the relevant consent text or its version; the fact that consent was withdrawn; the date and time consent was withdrawn.\n\n6.3. Records of consent and its withdrawal are retained in accordance with the periods provided by applicable law and the data retention rules.\n\n6.4. MyBakuriani must be able, where necessary, to demonstrate the existence of the user's relevant marketing consent, the time it was obtained and the mechanism used.",
    },
    {
      id: "opt-out",
      title: "7. Withdrawal of Consent (Opt-out)",
      body: "7.1. The user has the right at any time to withdraw the consent given to the processing of data for direct marketing purposes.\n\n7.2. Withdrawal of consent must be simple, accessible and free of charge.\n\n7.3. The user may opt out of direct marketing, including: by changing the relevant setting in their personal dashboard; through the Unsubscribe mechanism included in a marketing email; through the STOP or other relevant instruction indicated in an SMS; by sending a request to MyBakuriani: info.mybakuriani@gmail.com.\n\n7.4. Where direct marketing is carried out through a specific form of communication, MyBakuriani ensures that the user can opt out of marketing through the same form or through another accessible and appropriate means.\n\n7.5. No fee or other restriction is imposed on the user for withdrawing consent.",
    },
    {
      id: "opt-out-deadline",
      title: "8. Deadline for Stopping Marketing",
      body: "8.1. After receiving a request to stop processing data for direct marketing purposes, MyBakuriani takes appropriate technical and organizational measures to stop further use of the user's data for direct marketing.\n\n8.2. Processing of data for direct marketing purposes will stop within the period established by law, but no later than 7 working days from receipt of the user's relevant request.\n\n8.3. MyBakuriani ensures that the relevant information is available to the persons/service providers involved in carrying out direct marketing, so that the user's opt-out is promptly reflected in the relevant communication systems.\n\n8.4. Due to technical synchronization or an already-scheduled message, an individual message may be received while the request is being processed; MyBakuriani takes reasonable measures to avoid such cases.",
    },
    {
      id: "service-communications",
      title: "9. Effect of Opting Out of Marketing on Service Communications",
      body: "9.1. Opting out of marketing does not automatically mean that necessary transactional or service messages are switched off.\n\n9.2. The user may continue to receive messages that are necessary for account security, OTP/authorization, a feature requested by the user, fulfilling a Smart Match request, servicing a booking/request, or providing another relevant service.\n\n9.3. Such messages must not be used to circumvent marketing consent.",
    },
    {
      id: "review-requests",
      title: "10. Review Requests",
      body: "10.1. A request for the user to leave a rating or review may be carried out as a service communication if its purpose is to obtain the user's assessment of a service they received and it contains no marketing offer.\n\n10.2. If a review request contains an element of direct marketing or a commercial offer, the relevant communication is subject to the marketing rules established by this Policy.",
    },
    {
      id: "communication-content",
      title: "11. Content of Communications",
      body: "11.1. A marketing communication must be identifiable to the user as a communication of a commercial/advertising nature where applicable law so requires.\n\n11.2. MyBakuriani must not use false, misleading or unverified information in marketing communications.\n\n11.3. Information about a discount, special offer or other commercial condition must reflect the actual terms of the relevant offer.\n\n11.4. Responsibility for the content of an offer provided by a listing author is determined by MyBakuriani's Terms of Use and applicable law; MyBakuriani does not confirm the commercial terms of an offer beyond what has actually been confirmed within the scope of the specific service.",
    },
    {
      id: "data-processing",
      title: "12. Processing of Personal Data",
      body: "12.1. Personal data related to direct marketing is processed in accordance with MyBakuriani's Privacy Policy and the applicable legislation of Georgia.\n\n12.2. The user has the right to request information about their marketing consent, change their choice of communication channels, or withdraw the relevant consent in the manner established by law.\n\n12.3. The volume of data used for marketing purposes must correspond to the relevant purpose and the requirements of applicable law.\n\n12.4. MyBakuriani takes appropriate technical and organizational measures to protect marketing data and to prevent unauthorized access to it.",
    },
    {
      id: "channel-management",
      title: "13. Managing Communication Channels",
      body: "13.1. The user may be given the option to manage, in their personal dashboard, the marketing communication channels available to them.\n\n13.2. Where technically possible, the user may manage SMS, email, WhatsApp and push marketing separately.\n\n13.3. Withdrawing consent for one channel does not automatically cancel consent given for other channels, unless the user has separately requested that they be stopped.",
    },
    {
      id: "policy-changes",
      title: "14. Changes to This Policy",
      body: "14.1. MyBakuriani is entitled to periodically update this Policy, including due to new communication channels, technologies, features or changes in legislation.\n\n14.2. The updated version will be published on the Platform with the relevant date and version indicated.\n\n14.3. If a change to this Policy materially alters the user's rights, the terms of marketing communication or the rules of data processing, and the law requires additional notice to or consent from the user, MyBakuriani will provide the relevant notice or obtain the necessary consent.",
    },
    {
      id: "contact-info",
      title: "15. Contact Information",
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
