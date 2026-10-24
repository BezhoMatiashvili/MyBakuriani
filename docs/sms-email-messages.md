# SMS and email: what we send, and when

Every SMS and email MyBakuriani sends, with the exact text. Checked against the code and the live staging database on 24 Oct 2026.

- Texts are copied exactly. Words in `[brackets]` are filled in for each message (name, date, link…).
- Many messages are copies of a site notice (the bell). The **SMS** is the notice title with `MyBakuriani: ` in front. The **email** uses the title as the subject and the notice text as the body.
- Times are Tbilisi time. A queued SMS goes out within about 1 minute, an email within about 5 minutes, at any hour.

## SMS

### 1. To guests of the host's own bookings

These are bookings the host adds in the calendar. The host switches each text on in **SMS ცენტრი** and pays **1 SMS credit** per text. They go to the guest phone typed in the booking.

| Case | SMS text | When we send it |
|---|---|---|
| **Check-in reminder**<br>Tells the guest when check-in starts, with the listing link, map pin and the host's phone. Lines with no value are left out. | გამარჯობა, [Guest_Name]! გელოდებით ხვალ [Check_In_Time]-დან — [Property_Name].<br>🔗 [Listing_Link]<br>📍 [Location]<br>☎️ [Host_Phone] | The day before check-in, at 10:00.<br>A booking for today, or for tomorrow made after 10:00: about 1 hour after it is saved. If the check-in day has already begun by then, the text says **დღეს** (today) instead of **ხვალ**. |
| **Marketing consent request**<br>Asks the guest if they agree to get marketing SMS. Without a "yes", come-back texts are not sent. | MyBakuriani.ge: გსურთ მარკეტინგული SMS-ების მიღება? დაადასტურეთ ან უარი თქვით: [Consent_Link] | Right away, when the host presses **თანხმობის SMS-ის გაგზავნა** in the **სტუმრის SMS-თანხმობა** panel of the booking's edit window. |
| **Come-back offer**<br>Invites a past guest back with the host's discount. Only if the guest said yes to marketing SMS and has not booked this host again. | [Guest_Name], დაბრუნდით ბაკურიანში! მიიღეთ [Discount_Value] ფასდაკლება ([Discount_Period]): [Property_Direct_Link] — MyBakuriani<br><br>If the host left the discount fields empty:<br>[Guest_Name], დაბრუნდით ბაკურიანში! თქვენთვის სპეციალური შეთავაზება: [Property_Direct_Link] — MyBakuriani | 90 days after check-out, at 10:00. |

### 2. Payments, membership and VIP

Free. They go to the account that paid or owns the listing.

| Case | SMS text | When we send it |
|---|---|---|
| **Wallet topped up**<br>The user topped up by card, or an admin added a balance bonus. | MyBakuriani: ბალანსი შეივსო | As soon as the card payment is confirmed, or when the admin adds the bonus. |
| **Package bought**<br>The user bought an SMS package or a discount badge from the wallet. | MyBakuriani: გადახდა წარმატებულია | Right after the purchase. |
| **VIP or SUPER VIP bought**<br>Sent instead of the "package bought" text. | MyBakuriani: თქვენი VIP გააქტიურდა. | Right after the purchase. |
| **Payment failed**<br>A purchase did not go through (not enough balance, SUPER VIP already active, or another error). Nothing was charged. | MyBakuriani: გადახდა ვერ შესრულდა | Right away. |
| **Card refund**<br>Money went back to the user's card. | MyBakuriani: თანხა დაბრუნდა ბარათზე | When Keepz (the card payment provider) confirms a refund an admin started. |
| **Season membership paid**<br>The host paid for the season membership. It now waits for an admin. | MyBakuriani: საწევრო გადახდილია. ელოდება დადასტურებას. | Right after paying. |
| **Season membership approved** | MyBakuriani: თქვენი სეზონური საწევრო დამტკიცდა. | When an admin approves it. |
| **VIP ending soon**<br>A listing's VIP or SUPER VIP ends within 6 hours. | MyBakuriani: თქვენი VIP მალე იწურება. | About 5–6 hours before it ends (checked every hour at :30). |

### 3. Listings and ownership

Free. They go to the listing's owner.

| Case | SMS text | When we send it |
|---|---|---|
| **Listing approved**<br>Only the Approve button sends it. Changing a status elsewhere in the admin panel sends nothing. | MyBakuriani: თქვენი განცხადება დამტკიცდა | When an admin presses Approve. |
| **Listing rejected**<br>The reason is in the email and on the site. | MyBakuriani: თქვენი განცხადება უარყოფილია | When an admin presses Reject. |
| **Ownership request answered**<br>An admin approved or rejected the owner's ownership request (the result is on the site). Also sent if the listing's address, cadastral code or map pin changes while the request waits. | MyBakuriani: მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია | When the admin decides, or when the change is saved. |
| **Ownership badge removed**<br>An admin took the "verified owner" badge away, or the listing's address, cadastral code or map pin changed. | MyBakuriani: მესაკუთრეობის დადასტურება გაუქმდა | When the admin removes it, or when the change is saved. |

### 4. Cleaners, Smart Match and jobs

| Case | SMS text | When we send it |
|---|---|---|
| **New cleaning call-out**<br>To the cleaner. The host pays **1 SMS credit**. With no free credit, the cleaner gets only the email and the site notice. At most 3 a day from one host to one cleaner. | MyBakuriani: ახალი გამოძახება — [Apartment_Title], [Date_Time]. დეტალები: [Site_URL]/dashboard/cleaner | Right after the host sends the call-out. |
| **Call-out status changed**<br>To the host: the cleaner accepted, declined, started or finished, or agreed or refused to cancel. The SMS does not say which; the email does. Free. | MyBakuriani: დასუფთავების სტატუსი | When the cleaner changes the status. |
| **Cancel request**<br>To the cleaner: the host asks to cancel an accepted call-out. Free. | MyBakuriani: გაუქმების მოთხოვნა | Right away. |
| **Call-out cancelled**<br>To the cleaner: the host cancelled a call-out the cleaner had not accepted yet. Free. | MyBakuriani: გამოძახება გაუქმდა | Right away. |
| **Smart Match offer**<br>To the guest: an owner offered a place for their Smart Match request. Free. | MyBakuriani: ახალი შეთავაზება | When the owner sends the offer. |
| **Job application**<br>To the employer: someone applied to their vacancy. Free. | MyBakuriani: ახალი განაცხადი ვაკანსიაზე | When the application is sent. |

### 5. Sign-in code

| Case | SMS text | When we send it |
|---|---|---|
| **Phone sign-in code**<br>One-time code for signing in with a phone number, or for adding or changing the phone in the account. Free. On staging and production since 24 Oct 2026. | MyBakuriani კოდი: [Code]. არავის გაუზიაროთ.<br>@[Site_Host] #[Code] | Instantly, each time the user presses **SMS კოდის მიღება** (a new code can be asked for after 60 seconds). |

## Email

A notice email looks like this, from top to bottom:

- From: `MyBakuriani <no-reply@mybakuriani.ge>`
- Subject: the notice title
- **MyBakuriani** header, the title, a `კაბინეტი: [Cabinet]` line, the notice text, and a blue **ნახვა** button that opens the page on the site
- Footer: `ეს არის სერვისული შეტყობინება თქვენი MyBakuriani ანგარიშიდან.` and a **ჩემი ანგარიში** link

### 1. Payments, membership and VIP

| Case | Email | When we send it |
|---|---|---|
| **Wallet topped up**<br>By card, or an admin balance bonus. | **Subject:** ბალანსი შეივსო<br>**Text:** თქვენი ბალანსი შეივსო [Amount] ₾-ით. | As soon as the card payment is confirmed, or when the admin adds the bonus. |
| **Purchase succeeded**<br>SMS package, discount badge, VIP or SUPER VIP. | **Subject:** გადახდა წარმატებულია<br>**Text:** [Package_Name] გააქტიურდა. | Right after the purchase. |
| **Payment failed**<br>Nothing was charged. | **Subject:** გადახდა ვერ შესრულდა<br>**Text** (one of):<br>• *not enough balance:* არასაკმარისი ბალანსი. საჭიროა: [Required_Amount] ₾, ხელმისაწვდომია: [Available_Amount] ₾<br>• *SUPER VIP already active:* სტანდარტული VIP მიუწვდომელია, სანამ SUPER VIP აქტიურია.<br>• *any other error:* სცადეთ თავიდან. | Right away. |
| **Card refund** | **Subject:** თანხა დაბრუნდა ბარათზე<br>**Text:** [Amount] ₾ დაბრუნდა თქვენს ბარათზე. | When Keepz confirms a refund an admin started. |
| **Season membership paid**<br>Waits for an admin. | **Subject:** საწევროს გადახდა მიღებულია<br>**Text:** სეზონური საწევრო გადახდილია და ადმინისტრატორის დადასტურებას ელოდება. მოქმედების პერიოდი: [Start_Date] – [End_Date]. | Right after paying. |
| **Season membership approved** | **Subject:** სეზონური საწევრო დამტკიცდა<br>**Text** (one of):<br>• *starts now:* თქვენი საწევრო აქტიურია [End_Date]-მდე.<br>• *starts later:* თქვენი საწევრო დამტკიცდა და მოქმედებს [Start_Date] – [End_Date]. | When an admin approves it. |
| **Season membership rejected**<br>The money goes back to the wallet. | **Subject:** საწევრო არ დამტკიცდა<br>**Text** (one of):<br>• *no reason given:* გადახდილი [Amount] ₾ დაბრუნდა თქვენს ბალანსზე.<br>• *with a reason:* მიზეზი: [Reason] გადახდილი [Amount] ₾ დაბრუნდა თქვენს ბალანსზე. | When an admin rejects it. |
| **VIP ending soon** | **Subject:** VIP იწურება<br>**Text:** თქვენი VIP მალე იწურება. | About 5–6 hours before it ends. |
| **Company plan activated**<br>To the company owner. | **Subject:** გამოწერა გააქტიურდა<br>**Text:** კომპანიის "[Brand_Name]" [Plan_Name] პაკეტი გააქტიურდა. | Right after the company owner buys a plan. |

### 2. Listings, edits, companies and ownership

To the owner.

| Case | Email | When we send it |
|---|---|---|
| **Listing approved** | **Subject:** თქვენი განცხადება დამტკიცდა<br>**Text:** „[Listing_Title]" ([Type_Label]) დამტკიცდა და გამოქვეყნდა საიტზე. | When an admin presses Approve. |
| **Listing rejected** | **Subject:** თქვენი განცხადება უარყოფილია<br>**Text:** „[Listing_Title]" ([Type_Label]) უარყოფილია. მიზეზი: [Reason] | When an admin presses Reject. |
| **Edit approved**<br>An edit of a published listing or profile. | **Subject:** ცვლილება დამტკიცდა<br>**Text:** თქვენი საჯარო კონტენტის ცვლილება დამტკიცდა. | When an admin approves the edit. |
| **Edit rejected**<br>The text is the admin's reason. | **Subject:** ცვლილება უარყოფილია<br>**Text:** [Rejection_Reason] | When an admin rejects the edit. |
| **Edit could not be saved**<br>The admin approved it, but saving failed (for example, the phone or cadastral code is already used). | **Subject:** ცვლილება ვერ გამოქვეყნდა<br>**Text:** შეყვანილი მონაცემები ვერ შეინახა (შესაძლოა ნომერი ან საკადასტრო კოდი უკვე გამოყენებულია). გთხოვთ, შეასწოროთ და ხელახლა გაგზავნოთ. | At the admin's approval. |
| **Company approved** | **Subject:** კომპანია დადასტურდა<br>**Text:** კომპანია „[Company_Name]" დადასტურდა. თქვენი ობიექტები გამოქვეყნდება საჯაროდ. | When an admin approves the company. |
| **Company rejected** | **Subject:** კომპანია უარყოფილია<br>**Text:** კომპანია „[Company_Name]" უარყოფილია. მიზეზი: [Reason] | When an admin rejects the company. |
| **Ownership request answered** | **Subject:** მესაკუთრეობის დადასტურება: მოთხოვნა განხილულია<br>**Text** (one of):<br>• *admin decided:* მესაკუთრეობის დადასტურების მოთხოვნა განხილულია. შედეგი იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.<br>• *listing data changed while waiting:* განცხადების მონაცემები შეიცვალა, ამიტომ მესაკუთრეობა ხელახლა უნდა დადასტურდეს. დეტალები იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“. | When the admin decides, or when the change is saved. |
| **Ownership badge removed** | **Subject:** მესაკუთრეობის დადასტურება გაუქმდა<br>**Text** (one of):<br>• *removed by an admin:* განცხადების მესაკუთრეობის დადასტურება გაუქმდა. მიზეზი იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“.<br>• *listing data changed:* განცხადების მონაცემები შეიცვალა, ამიტომ მესაკუთრეობა ხელახლა უნდა დადასტურდეს. დეტალები იხილეთ გვერდზე „მესაკუთრეობის დადასტურება“. | When the admin removes it, or when the change is saved. |

### 3. Cleaners, Smart Match, jobs and company agents

| Case | Email | When we send it |
|---|---|---|
| **New cleaning call-out**<br>To the cleaner. | **Subject:** ახალი გამოძახება<br>**Text:** [Apartment_Title] • [Date_Time] • [Address] | Right after the host sends the call-out. |
| **Call-out status changed**<br>To the host. | **Subject:** დასუფთავების სტატუსი<br>**Text** (one of):<br>• *accepted:* დამლაგებელმა დაადასტურა გამოძახება<br>• *declined:* დამლაგებელმა უარყო გამოძახება<br>• *started:* დასუფთავება დაიწყო<br>• *finished:* დასუფთავება დასრულდა<br>• *agreed to cancel:* დამლაგებელი დაეთანხმა გამოძახების გაუქმებას<br>• *refused to cancel:* დამლაგებელი არ დაეთანხმა გაუქმებას — გამოძახება ძალაში რჩება | When the cleaner changes the status. |
| **Cancel request**<br>To the cleaner. | **Subject:** გაუქმების მოთხოვნა<br>**Text:** მესაკუთრემ დადასტურებული გამოძახების გაუქმება მოითხოვა | When the host asks to cancel an accepted call-out. |
| **Call-out cancelled**<br>To the cleaner. | **Subject:** გამოძახება გაუქმდა<br>**Text:** მესაკუთრემ გამოძახება მიღებამდე გააუქმა | When the host cancels a call-out the cleaner had not accepted yet. |
| **New Smart Match request**<br>To every owner with an active rental listing. | **Subject:** ახალი Smart Match მოთხოვნა<br>**Text:** სტუმარი ეძებს [Zone]-ში [Check_In] – [Check_Out] | When a guest posts a Smart Match request. |
| **Smart Match offer**<br>To the guest. | **Subject:** ახალი შეთავაზება<br>**Text:** მფლობელმა შემოგთავაზათ ობიექტი ფასით [Offered_Price]₾ | When an owner sends an offer. |
| **Job application**<br>To the employer. | **Subject:** ახალი განაცხადი ვაკანსიაზე<br>**Text:** [Applicant_Name] გამოეხმაურა თქვენს ვაკანსიას „[Vacancy_Title]" | When someone applies to a vacancy. |
| **Agent request**<br>To the company owner. | **Subject:** ახალი აგენტის მოთხოვნა<br>**Text:** [Requester_Name] ითხოვს კომპანიაში "[Company_Name]" აგენტად დამატებას. | When a user asks to join the company as an agent (at sign-up or from the seller cabinet). |
| **Agent request answered**<br>To the user who asked. | **Subject:** აგენტობა დადასტურდა<br>**Text:** თქვენ დაემატეთ კომპანიას "[Company_Name]" აგენტად.<br><br>**Subject:** აგენტობა უარყოფილია<br>**Text:** კომპანიამ "[Company_Name]" უარყო თქვენი მოთხოვნა. | When the company owner approves or rejects the request. |

### 4. To admins

| Case | Email | When we send it |
|---|---|---|
| **New listing to check** | **Subject:** ახალი განცხადება მოდერაციაზე<br>**Text:** „[Listing_Title]" ელოდება ადმინისტრატორის დადასტურებას. | When a user submits a new listing. |
| **New edit to check** | **Subject:** ახალი ცვლილება განსახილველად<br>**Text:** [Requester_Name] ითხოვს ცვლილების დამტკიცებას ([Target_Label]). | When an owner edits published content. |
| **New company to check** | **Subject:** ახალი კომპანია ვერიფიკაციაზე<br>**Text:** „[Company_Name]" ელოდება ვერიფიკაციას. | When a user registers a company. |
| **Membership to approve** | **Subject:** საწევრო ელოდება დადასტურებას<br>**Text:** [Package_Name]-ის სეზონური საწევრო გადახდილია და განხილვას ელოდება. | When a host pays for a season membership. |
| **Card payment needs a check**<br>The card company returned an unexpected status (for example, a refund made outside the site). | **Subject:** ბარათით გადახდა საჭიროებს შემოწმებას<br>**Text:** Keepz-მა დააბრუნა სტატუსი [Keepz_Status] გადახდაზე [Amount] ₾. | When a payment status check finds the problem. One email until the admin reads the notice. |

### 5. Sent by an admin

| Case | Email | When we send it |
|---|---|---|
| **Offer / advertising email**<br>Only to chosen users who switched on **შეთავაზებები ელფოსტით**. The footer explains why they get it and links to the setting. | **Subject:** [Subject]<br>**Text:** [Message] (both typed by the admin)<br>Footer: ამ წერილს იღებთ, რადგან MyBakuriani-ზე ჩართული გაქვთ „შეთავაზებები ელფოსტით“.<br>გამოწერის გაუქმება: [Site_URL]/dashboard/account | When an admin sends it from **/dashboard/admin/broadcast** (kind "შეთავაზება / რეკლამა"). It goes out in batches of up to 25 every 5 minutes. |
| **Service email**<br>To all chosen users, whatever their offer setting. | **Subject:** [Subject]<br>**Text:** [Message] (both typed by the admin)<br>Footer: ეს არის სერვისული შეტყობინება თქვენი MyBakuriani ანგარიშიდან.<br>ჩემი ანგარიში: [Site_URL]/dashboard/account | When an admin sends it from **/dashboard/admin/broadcast** (kind "სერვისული შეტყობინება"). Same batches. |
| **Invoice**<br>To the address the admin types. It carries a link, not a PDF. | **Subject:** ინვოისი [Invoice_Number] — MyBakuriani<br>**Text:** გამარჯობა, [Recipient_Name]!<br>გიგზავნით ინვოისს № [Invoice_Number].<br>გადასახდელი თანხა: [Amount]<br>გადახდის ვადა: [Due_Date]<br><br>ინვოისის ნახვა და ჩამოტვირთვა: [Invoice_Link]<br>ბმული მოქმედებს [Link_Expiry]-მდე.<br><br>--<br>წერილი გამოგზავნილია MyBakuriani-დან. ინვოისი არ არის RS-ის ელექტრონული საგადასახადო ანგარიშ-ფაქტურა.<br>[Issuer_Contact] | Instantly, when an admin presses **ელფოსტით გაგზავნა** on an invoice. |

### 6. Account emails (sent by Supabase)

These texts live in the Supabase dashboard (Auth → Email templates), not in the code. Sign-up: copied from production's settings saved on 19 Oct 2026. Password reset: set on staging and production on 24 Oct 2026.

| Case | Email | When we send it |
|---|---|---|
| **Confirm sign-up**<br>Needed before the first email sign-in. | **Subject:** დაადასტურეთ ელ. ფოსტა — MyBakuriani<br>**Text:** დაადასტურეთ თქვენი ელ. ფოსტა<br>MyBakuriani-ზე რეგისტრაციის დასასრულებლად დააჭირეთ ქვემოთ მოცემულ ღილაკს.<br>Button: **ელ. ფოსტის დადასტურება**<br>ბმული ერთჯერადია და მოქმედებს შეზღუდული დროით. თუ ღილაკი არ მუშაობს, გახსენით ეს მისამართი ბრაუზერში: [Link]<br>თუ MyBakuriani-ზე რეგისტრაცია არ მოგითხოვიათ, უბრალოდ უგულებელყავით ეს წერილი.<br>ეს არის სერვისული შეტყობინება MyBakuriani-დან. | Right after someone signs up with email and password, and again on **ბმულის ხელახლა გაგზავნა**. |
| **Password reset**<br>Opens the **ახალი პაროლის დაყენება** page. The link works once, in any browser. | **Subject:** პაროლის აღდგენა — MyBakuriani<br>**Text:** პაროლის აღდგენა<br>MyBakuriani-ზე ახალი პაროლის დასაყენებლად დააჭირეთ ქვემოთ მოცემულ ღილაკს.<br>Button: **ახალი პაროლის დაყენება**<br>ბმული ერთჯერადია და მოქმედებს შეზღუდული დროით. თუ ღილაკი არ მუშაობს, გახსენით ეს მისამართი ბრაუზერში: [Link]<br>თუ პაროლის აღდგენა არ მოგითხოვიათ, უბრალოდ უგულებელყავით ეს წერილი — თქვენი პაროლი არ შეიცვლება.<br>ეს არის სერვისული შეტყობინება MyBakuriani-დან. | When the user asks for it on **/auth/forgot-password** (**ბმულის გაგზავნა**). |

## Not sent any more

- **Review request** to guests the day after check-out (`[Guest_Name], მადლობა! შეგვიფასეთ ბინა: [Property_Review_Link] — MyBakuriani`): reviews were removed from the site on 24 Oct 2026. Texts still queued were cancelled, and old review links now open the home page.
- **Price-drop alert** to buyers who pressed "შემატყობინე ფასის კლებისას": `ფასი შემცირდა! [Listing_Title]: [Old_Price]→[New_Price][Currency]. [Site_URL]/sales/[Listing_ID] — MyBakuriani`. Since 23 Oct 2026 no seller can switch it on (the page was removed). A seller rule switched on before that can still send it, 24 hours after the price drops, and the seller pays 1 credit per buyer.
- **Owner-written SMS** (texts to past guests, contacts or leads, and one-to-one texts): removed in Aug 2026. The admin email that went with it (`SMS დაგზავნა ელოდება დადასტურებას`) can no longer fire.
- **Restaurant discount emails**: restaurants cannot have discounts any more (Oct 2026).
- **Email-change and re-login code emails** from Supabase: the site never asks for them.

## Rules

- **Who pays for an SMS:** sign-in codes and all notice, payment, membership and VIP texts are free (the platform pays). The host pays for check-in, consent and come-back texts. The host who calls a cleaner pays for the call-out text. It is 1 credit per text, whatever its length. The credit is taken when the SMS provider accepts the text and given back if it is not delivered.
- **Which phone:** host texts go to the guest phone typed in the booking. Notice texts go to the phone in the user's profile. If the profile has none, they go to the phone on the user's listing, never on a listing still waiting for approval. Membership and VIP texts use only the profile phone. Only Georgian mobiles (+995 5XX XX XX XX) are texted.
- **Limits on notice texts:** 3 per person per type per cabinet, 8 per person, and 8 per phone number, all per 24 hours. A notice text not sent within 6 hours is dropped. Test accounts (`@e2e.mybakuriani.test`) are never texted.
- **Marketing consent:** come-back texts need the guest's "yes" from the consent link. They also stop if the guest's own account has **შეთავაზებები და ფასდაკლებები SMS-ით** off. Check-in texts, notice texts and codes do not need consent.
- **Email:** sent only to confirmed addresses. An address that bounced or reported spam is never emailed again. For the types anyone can trigger (failed payment, call-outs, Smart Match, job and agent requests, admin queues), each person gets at most 3 emails per type per cabinet per 24 hours; the site notice still arrives. Payment emails go first, and there is a daily total limit. Unsent mail is dropped after 3 days.
- **No opt-out for notices:** no user setting turns off notice SMS or emails. **შეთავაზებები ელფოსტით** only controls the admin offer emails.
- **Everything else is bell only:** admin status changes, gifted SMS credits, "listing submitted" and new ownership requests to admins appear only on the site.
- **Master switches:** nothing is sent unless the server has SMS on (`SMS_DELIVERY_ENABLED`) and email on (`EMAIL_DELIVERY_ENABLED` plus its allow-list). Host texts also need `SMS_RENTAL_MODE`.

## Known issues

1. **Membership and VIP texts reach only profile phones.** Users who signed up by email or Google and never added a phone don't get them. Other notice texts fall back to the listing's phone.
2. **The call-out status SMS doesn't say what happened.** All six cases send `MyBakuriani: დასუფთავების სტატუსი`; only the email says which.
3. **The notification switches on profile and settings pages** (new requests, favourites, monthly report) are saved, but no sender reads them.

## Where the texts live

- Host texts and the sign-in code: `supabase/functions/sms-automation-run/domain.ts` (`TEMPLATES`)
- Notice titles and texts (used by both the SMS and the email): the database functions and API routes that create notices, for example `src/app/api/admin/listings/moderate/route.ts`
- Call-out SMS: database function `notify_cleaner_of_new_task`. Purchase and membership SMS: `_enqueue_system_sms` calls. VIP-ending SMS: `supabase/functions/vip-lifecycle/index.ts`
- Email layout: `src/lib/email/render.ts`. Invoice email: `src/lib/finance/server/invoices.ts`. Account emails: the Supabase dashboard
