import { MessageSquare, Bug, Lightbulb } from 'lucide-react';
import { C } from '../../constants/colors';

export const TYPE_META = {
  feedback:   { label: 'Feedback',   icon: MessageSquare, color: C.lav },
  bug:        { label: 'Bug',        icon: Bug,           color: C.rose },
  suggestion: { label: 'Suggestion', icon: Lightbulb,     color: C.amber },
};

export const STATUS_META = {
  open:        { label: 'Unreviewed', color: C.lav },
  seen:        { label: 'Seen',        color: C.textFaint },
  in_progress: { label: 'In Progress', color: C.amber },
  resolved:    { label: 'Resolved',    color: C.sage },
  wont_fix:    { label: "Won't fix",   color: C.textFaint },
};

export const FILTERS = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'all',        label: 'All' },
  { value: 'bug',        label: 'Bugs' },
  { value: 'suggestion', label: 'Suggestions' },
  { value: 'feedback',   label: 'Feedback' },
];

export const STATUS_ACTIONS = [
  { value: 'seen',        label: 'Mark reviewed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'wont_fix',    label: "Won't fix" },
];
