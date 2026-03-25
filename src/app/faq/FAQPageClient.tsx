"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import ScrollReveal from "@/components/shared/ScrollReveal";

const FAQ_ITEMS = [
  {
    question: "როგორ დავჯავშნო აპარტამენტი?",
    answer:
      'აირჩიეთ სასურველი აპარტამენტი, მიუთითეთ შესვლისა და გასვლის თარიღები, სტუმრების რაოდენობა და დააჭირეთ „ჯავშანი" ღილაკს. მესაკუთრე დაადასტურებს თქვენს მოთხოვნას 24 საათის განმავლობაში.',
  },
  {
    question: "როგორ ხდება გადახდა?",
    answer:
      "გადახდა ხორციელდება პლატფორმის ბალანსის მეშვეობით. შეავსეთ ბალანსი ბანკის ბარათით (TBC, BOG) და გადაიხადეთ ჯავშნის ღირებულება. გარანტირებული თანხის დაცვა უზრუნველყოფილია.",
  },
  {
    question: "რა არის ვერიფიცირებული მესაკუთრე?",
    answer:
      "ვერიფიცირებული მესაკუთრე არის ის, ვინც წარმატებით გაიარა პიროვნების დადასტურება, საკუთრების დოკუმენტაციის შემოწმება და ადმინისტრაციის მიერ დამტკიცება. ეს გარანტიას გაძლევთ, რომ საქმე გაქვთ სანდო პირთან.",
  },
  {
    question: "შემიძლია ჯავშნის გაუქმება?",
    answer:
      "დიახ, ჯავშნის გაუქმება შესაძლებელია. გაუქმების პოლიტიკა დამოკიდებულია მესაკუთრის მიერ დადგენილ წესებზე. ზოგადად, 48 საათით ადრე გაუქმების შემთხვევაში სრული თანხა უბრუნდება.",
  },
  {
    question: "როგორ გავხდე მესაკუთრე პლატფორმაზე?",
    answer:
      "დარეგისტრირდით, დაამატეთ თქვენი ობიექტი ფოტოებითა და აღწერით, ატვირთეთ საკუთრების დამადასტურებელი დოკუმენტი და დაელოდეთ ადმინისტრაციის დამტკიცებას. პროცესი ჩვეულებრივ 1-2 სამუშაო დღე სჭირდება.",
  },
  {
    question: "რა სერვისებია ხელმისაწვდომი პლატფორმაზე?",
    answer:
      "პლატფორმაზე ხელმისაწვდომია: ტრანსპორტი და ტრანსფერები, სერვისები და ხელოსნები, გართობა და აქტივობები, კვება და რესტორნები, დასაქმების განცხადებები და სხვა.",
  },
  {
    question: "რა არის Smart Match?",
    answer:
      "Smart Match არის ჩვენი ალგორითმი, რომელიც ავტომატურად არჩევს თქვენთვის საუკეთესო აპარტამენტებს თქვენი პრეფერენციების მიხედვით: ბიუჯეტი, ლოკაცია, სტუმრების რაოდენობა და სხვა კრიტერიუმები.",
  },
  {
    question: "როგორ დავუკავშირდე მხარდაჭერის გუნდს?",
    answer:
      "მხარდაჭერის გუნდთან დაკავშირება შეგიძლიათ პლატფორმის ჩატის მეშვეობით, ელ-ფოსტით ან ტელეფონით. ჩვენი გუნდი ხელმისაწვდომია ყოველდღე 09:00-დან 21:00-მდე.",
  },
];

export default function FAQPageClient() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <ScrollReveal>
        <h1 className="text-3xl font-bold">ხშირად დასმული კითხვები</h1>
        <p className="mt-2 text-muted-foreground">
          პასუხები ყველაზე გავრცელებულ კითხვებზე
        </p>
      </ScrollReveal>

      <div className="mt-10 divide-y divide-border rounded-2xl bg-white shadow-sm">
        {FAQ_ITEMS.map((item, i) => (
          <ScrollReveal key={i} delay={i * 0.05}>
            <div>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-sm font-medium text-foreground transition-colors hover:text-foreground/80"
              >
                <span>{item.question}</span>
                <motion.span
                  animate={{ rotate: openIndex === i ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-4 shrink-0"
                >
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {item.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
