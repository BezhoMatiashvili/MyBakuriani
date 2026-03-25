import { type Variants } from "framer-motion";

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
};

export const slideUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
};

export const staggerChildren: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

export const slideFromRight: Variants = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { type: "spring", damping: 25 } },
  exit: { x: "100%", transition: { duration: 0.2 } },
};

export const slideFromBottom: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: { type: "spring", damping: 25 } },
  exit: { y: "100%", transition: { duration: 0.2 } },
};
