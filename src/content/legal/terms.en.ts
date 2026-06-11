import type { LegalDoc } from "./types";

export const termsEn: LegalDoc = {
  title: "Terms of Use",
  lastUpdated: "Last updated: 18-05-2026",
  sections: [
    {
      id: "preamble",
      title: "1. Preamble and About Us",
      body: "Welcome to the unified digital ecosystem that brings together the platforms MyBakuriani.ge and Mydasveneba.ge.\n\nThis document constitutes a legally binding agreement (hereinafter the “Agreement” or the “Terms”) between the Platform and its User. By logging in to the Platform, creating an account, posting a listing, or using any of its services, the User confirms that they have fully read, understood, and unconditionally agree to these Terms.",
    },
    {
      id: "contact",
      title: "2. Contact Information",
      body: "The controller of your personal data and the owner of the Platform is:",
      bullets: [
        "Individual Entrepreneur: Luka Matiashvili",
        "Legal address: Khomli St. 11g",
        "Email: info@mybakuriani.ge",
      ],
    },
    {
      id: "definitions",
      title: "3. Definitions",
      body: "The terms used in these Terms have the following meanings:",
      bullets: [
        "Platform / Ecosystem / We: the websites MyBakuriani.ge, Mydasveneba.ge, and the digital services associated with them.",
        "User / You: any natural or legal person who uses the Platform (regardless of whether or not they are logged in).",
        "Account (Unified ID): a personal, unified profile created by the User within our ecosystem.",
        "Owner / Provider (Host): a User who posts a listing on the Platform for real estate, transport, a job vacancy, or another service for commercial purposes.",
        "Guest / Seeker (Guest): a User who searches for property, employment, or a service through posted listings or the Smart Match system.",
        "Smart Match: an integrated Platform feature that automatically connects a Guest’s request with a suitable provider.",
        "Internal Balance (Wallet): your personal wallet on the Platform, from which you pay for paid services (VIP, membership fees, etc.).",
        "Conventional Unit (Credit): the Platform’s internal, virtual unit of account, which the User purchases with real money and uses solely within the Platform to obtain specific services (e.g., sending SMS/WhatsApp messages).",
      ],
    },
    {
      id: "unified-account",
      title: "4. Unified Account and User Status",
      subsections: [
        {
          id: "unified-id",
          title: "4.1. Unified Authorization (Unified ID)",
          body: "The platforms use a unified authorization system. An account, balance, and user data created on MyBakuriani.ge may automatically extend to other platforms within the ecosystem, including Mydasveneba.ge.",
        },
        {
          id: "age-limit",
          title: "4.2. Age Restriction",
          body: "Only adults (18+) with full legal capacity may use the Platform’s commercial services.",
        },
        {
          id: "account-security",
          title: "4.3. Account Security",
          body: "The User is responsible for the security of their own Account, including protecting their login credentials, OTP codes, and access. Any action performed from the User’s Account shall be legally deemed an action performed directly by the User.",
        },
      ],
    },
    {
      id: "platform-status",
      title: "5. Platform Status and Limitation of Liability",
      subsections: [
        {
          id: "intermediary",
          title: "5.1. Information Intermediary",
          body: "The Platform constitutes a technological and informational infrastructure that enables the posting of listings and communication between Users. The Platform is not: a real estate agency; a travel agency; a broker; a party to any transaction.",
        },
        {
          id: "user-transactions",
          title: "5.2. Transactions Between Users",
          body: "Any agreement, booking, payment, use of property, or receipt of services takes place directly between Users. The Platform is not liable for: the condition of any property; the accuracy of listings; booking cancellations; financial loss; property damage; the actions of third parties.",
        },
        {
          id: "liability-limit",
          title: "5.3. Limitation of Liability",
          body: "The Platform’s financial liability, in the event of any technical disruption, data loss, or other damage, is limited to the amount actually paid by the User directly for the disputed service (the specific transaction), and shall in no case exceed 500 (five hundred) GEL. Furthermore, the amount of compensation shall be calculated proportionally (Pro-rata), based on the unused days/volume of service delivery.",
        },
        {
          id: "ai-automation",
          title: "5.4. AI and Automation",
          body: "The Platform uses automated algorithms and artificial intelligence (AI) technologies for text generation or for the Smart Match functionality. Results generated by AI constitute technological recommendations only.",
        },
        {
          id: "force-majeure",
          title: "5.5. Force Majeure",
          body: "The Platform is not liable for technical disruptions, cyberattacks, internet problems, or other force majeure circumstances.",
        },
        {
          id: "ecommerce-law",
          title: "5.6. Electronic Commerce Legislation and Takedown Mechanism",
          body: "For the purposes of the Law of Georgia on Electronic Commerce, the Platform constitutes an intermediary service (hosting) provider. The Platform has no general obligation to monitor uploaded information. Any person who believes that information posted on the Platform violates their rights or the law may send a notice to the email address: info@mybakuriani.ge (Notice and Takedown).",
        },
      ],
    },
    {
      id: "listings-content",
      title: "6. Posting Listings and Content",
      subsections: [
        {
          id: "zero-text",
          title: "6.1. Zero-Text Policy",
          body: "For security purposes, the following is prohibited:",
          bullets: [
            "Including a phone number in the title or description;",
            "Inserting WhatsApp/Viber/Telegram links;",
            "Adding external links;",
            "Price manipulation or attempts to circumvent the system.",
          ],
        },
        {
          id: "intellectual-property",
          title: "6.2. Intellectual Property",
          body: "By uploading photos, videos, or other content to the Platform, the User grants the Platform a non-exclusive license to use that material for the Platform’s marketing purposes. The use of stolen (Stock) photos is prohibited.",
        },
        {
          id: "sanctions",
          title: "6.3. Sanctions",
          body: "The administration is entitled to remove content or block an Account without warning in cases of suspected fraud. In such cases, funds held in the internal balance or paid for a package are non-refundable.",
        },
      ],
    },
    {
      id: "balance-credits",
      title: "7. Internal Balance, Conventional Units, and Taxes",
      subsections: [
        {
          id: "wallet",
          title: "7.1. Wallet System",
          body: "Paid services (VIP, membership fees, etc.) are purchased through the internal balance (Wallet).",
        },
        {
          id: "credits",
          title: "7.2. Conventional Units (Communication Credits)",
          body: "For premium communication with Guests within the Platform (e.g., SMS or WhatsApp), the User purchases “conventional units” (credits).",
          bullets: [
            "1 credit = 1 successfully sent message.",
            "Purchased credits have no expiration date.",
            "Attention: a conventional unit constitutes solely an internal mechanism of the site. Converting it back into real money (GEL) or transferring it to another User is not permitted.",
          ],
        },
        {
          id: "tariffs",
          title: "7.3. Setting and Changing Tariffs",
          body: "The Platform reserves the right to change service tariffs at any time.",
          bullets: [
            "Already purchased packages: a change in tariff/rate does not affect credits already purchased or seasonal packages already activated, until their expiration.",
            "Dynamic services: the cost of one-time services (VIP boost, badge) is deducted from the balance at the tariff in effect at the time of the request.",
          ],
        },
        {
          id: "taxes",
          title: "7.4. Tax Obligations (Important!)",
          body: "The Platform is not a tax agent for any User. Any income that an Owner or service provider receives from clients through the Platform is subject to independent declaration in accordance with the Tax Code of Georgia. Amounts paid to the Platform constitute exclusively fees for informational-technological (IT/advertising) services.",
        },
      ],
    },
    {
      id: "reviews",
      title: "8. Reviews and Ratings",
      subsections: [
        {
          id: "leaving-reviews",
          title: "8.1. Leaving a Review",
          body: "A Review may be left only:",
          bullets: [
            "By physically scanning a QR code (on location);",
            "Through a booking confirmed via the Platform;",
            "Via a unique SMS link sent by the system.",
          ],
        },
        {
          id: "sms-reviews",
          title: "8.2. SMS Reviews",
          body: "An SMS message requesting a review is sent only if the Guest has given consent and the Owner has an active SMS credit.",
        },
        {
          id: "fake-reviews",
          title: "8.3. Fake Reviews",
          body: "Self-reviewing or manipulating ratings will result in the rating being reset or the property being blocked.",
        },
      ],
    },
    {
      id: "disputes",
      title: "9. Disputes and Complaints",
      body: "The User has the right to submit a complaint to the Platform by email. The Platform is entitled to request additional information or to temporarily suspend an Account. The Platform is not obligated to participate in resolving the merits of a private legal dispute between Users.",
    },
    {
      id: "governing-law",
      title: "10. Governing Law and Jurisdiction",
      body: "These Terms are governed by the legislation of Georgia. Any dispute shall be heard under the jurisdiction of the common courts of Georgia.",
    },
    {
      id: "changes",
      title: "11. Changes to the Terms",
      body: "The Platform is entitled to update or change these Terms at any time. The updated version takes effect from the moment it is published on the site.",
    },
  ],
};
