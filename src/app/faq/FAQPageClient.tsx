"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import ScrollReveal from "@/components/shared/ScrollReveal";

const FAQ_ITEMS = [
  {
    question: "როგორ დავჯავშნო აპარტამენტი?",
    answer:
      "აირჩიეთ სასურველი აპარტამენტი, მიუთითეთ შესვლისა და გასვლის თარიღები, სტუმრების რაოდენობა და დააჭირეთ ჯავშნის ღილაკს. მესაკუთრე დაადასტურებს თქვენს მოთხოვნას 24 საათის განმავლობაში.",
  },
  {
    question: "როგორ ხდება გადახდა?",
    answer:
      "გადახდა ხორციელდება პლატფორმის ბალანსის მეშვეობით. შეავსეთ ბალანსი ბანკის ბარათით (TBC, BOG) და გადაიხადეთ ჯავშნის ღირებულება.",
  },
  {
    question: "რა არის ვერიფიცირებული მესაკუთრე?",
    answer:
      "ვერიფიცირებული მესაკუთრე არის ის, ვინც წარმატებით გაიარა პიროვნების დადასტურება, საკუთრების დოკუმენტაციის შემოწმება და ადმინისტრაციის მიერ დამტკიცება.",
  },
  {
    question: "შემიძლია ჯავშნის გაუქმება?",
    answer:
      "დიახ, ჯავშნის გაუქმება შესაძლებელია. გაუქმების პოლიტიკა დამოკიდებულია მესაკუთრის მიერ დადგენილ წესებზე. ზოგადად, 48 საათით ადრე გაუქმებისას სრული თანხა უბრუნდება.",
  },
  {
    question: "როგორ გავხდე მესაკუთრე პლატფორმაზე?",
    answer:
      "დარეგისტრირდით, დაამატეთ თქვენი ობიექტი ფოტოებითა და აღწერით, ატვირთეთ საკუთრების დამადასტურებელი დოკუმენტი და დაელოდეთ ადმინისტრაციის დამტკიცებას.",
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
  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <ScrollReveal>
        <h1 className="text-[32px] font-black text-[#1E293B]">
          ხშირად დასმული კითხვები
        </h1>
        <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
          პასუხები ყველაზე გავრცელებულ კითხვებზე
        </p>
      </ScrollReveal>
      <div className="mt-10 divide-y divide-border rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
        {FAQ_ITEMS.map((item, i) => (
          <ScrollReveal key={i} delay={i * 0.05}>
            <div>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left text-[16px] font-bold text-[#1E293B] transition-colors hover:text-[#1E293B]/80"
              >
                <span>{item.question}</span>
                <motion.span
                  animate={{ rotate: openIndex === i ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-4 shrink-0"
                >
                  <ChevronDown className="h-5 w-5 text-[#94A3B8]" />
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
                    <p className="px-6 pb-5 text-[14px] text-[#64748B] leading-relaxed">
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
