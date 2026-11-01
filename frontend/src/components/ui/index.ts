/**
 * InkBoard UI kit. Import from "@/components/ui".
 * Tailwind + tokens only; no bespoke CSS classes. Tests assert on roles and labels, never class names.
 */
export { Button, IconButton, type ButtonVariant, type ButtonSize } from "./button";
export { Card, Surface } from "./surface";
export { Input, Field, SearchInput } from "./input";
export { Badge, Chip, type BadgeTone } from "./badge";
export { Kbd, Keys } from "./kbd";
export { Toast, toast, Skeleton, SkeletonRows, EmptyState, ErrorState, errorKind, Progress, Ring, type ErrorKind } from "./feedback";
export { Dialog, ConfirmDialog, Sheet, useIsPhone } from "./overlay";
export { Tabs, TabPanel, Switch, Select, Tooltip, Menu, Segmented, Check2 as Checkbox, type TabDef, type MenuItem } from "./controls";
export { Avatar } from "./avatar";
export { PageHeader, Toolbar, PageBody, Section, type Crumb } from "./page";
export { ListRow, List, Thumb, Dot, MetaLine } from "./list-row";
