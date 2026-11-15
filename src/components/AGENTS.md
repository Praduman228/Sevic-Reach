# UI rules
- Pipeline browser preferences are validated and stored per signed-in user after hydration; cards derive assignee initials from existing profiles — keeps navigation state without sharing preferences between accounts or adding reads.
- Funnel drill-downs use the same filtered report rows and contribution predicates as their displayed totals, so organisation lists reconcile without extra reads.
- Firm detail sections remain mounted and visible on one page with sticky local scroll navigation and reduced-motion support — jumping between sections preserves drafts and in-flight actions.
