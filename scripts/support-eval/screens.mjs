// The screens the walkthrough eval plans on (C43): page, QA account and the
// user's goal in Georgian. capture-screens.mjs records each one's elements
// into screens/<name>.json; plans.mjs scores Jev's steps against `expect`
// there (hand-written after looking at the captured elements):
//
//   first     the first step's target label contains one of these
//   done      the plan's done flag
//   ask       true: a question is the right answer (kind=ask)
//
// Every goal starts with "როგორ" so the widget's HOW_TO prefetch sends the
// plan request the capture records.

export const SCREENS = [
  {
    name: "renter-home-add-rental",
    role: "renter",
    path: "/dashboard/renter",
    goal: "როგორ დავამატო ახალი ბინა?",
  },
  {
    name: "rental-step1-hotel",
    role: "renter",
    path: "/create/rental",
    goal: "როგორ დავამატო სასტუმრო?",
  },
  {
    name: "rental-step1-stuck",
    role: "renter",
    path: "/create/rental",
    goal: "როგორ გადავიდე შემდეგ ნაბიჯზე?",
    // Pressed "Continue" with the required fields still empty.
    prepare: async (page) => {
      await page.getByRole("button", { name: "გაგრძელება" }).first().click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: "renter-balance-topup",
    role: "renter",
    path: "/dashboard/renter/balance",
    goal: "როგორ შევავსო ბალანსი 50 ლარით?",
  },
  {
    name: "renter-calendar-booking",
    role: "renter",
    path: "/dashboard/renter/calendar",
    goal: "როგორ დავამატო ჯავშანი კალენდარში?",
  },
  {
    name: "renter-cleaners-call",
    role: "renter",
    path: "/dashboard/renter/cleaners",
    goal: "როგორ გამოვიძახო დამლაგებელი?",
  },
  {
    name: "renter-profile-password",
    role: "renter",
    path: "/dashboard/renter/profile",
    goal: "როგორ შევცვალო პაროლი?",
  },
  {
    name: "account-link-google",
    role: "renter",
    path: "/dashboard/account",
    goal: "როგორ დავაკავშირო Google ანგარიში?",
  },
  {
    name: "login-register-email",
    path: "/auth/login",
    goal: "როგორ დავრეგისტრირდე ელ. ფოსტით?",
  },
  {
    name: "sale-required-fields",
    role: "seller",
    path: "/create/sale",
    goal: "როგორ შევავსო სავალდებულო ველები?",
  },
  {
    name: "guest-smart-match",
    role: "guest",
    path: "/dashboard/guest",
    goal: "როგორ გავაგზავნო Smart Match მოთხოვნა?",
  },
  {
    name: "public-home-search",
    path: "/",
    goal: "როგორ ვიპოვო ბინა დიდველზე 4 კაცისთვის?",
  },
];
