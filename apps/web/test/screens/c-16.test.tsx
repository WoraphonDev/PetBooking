import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { CareTasksScreen, groupByTime, isOverdue, SkipDialog, TaskRow } from "../../src/components/c-16/care-tasks-screen";
import messages from "../../src/i18n/messages/th/C-16.json";
import common from "../../src/i18n/messages/th/common.json";

const task = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  stayId: "00000000-0000-4000-8000-0000000000a1",
  petName: "โมจิ",
  roomCode: "A1",
  taskType: "feed",
  title: "ให้อาหาร",
  dueAt: "2026-10-05T01:00:00.000Z",
  status: "pending",
  doneAt: null,
  doneByName: null,
  note: null,
  photoUrl: null,
  medication: null,
  ...over,
});
const mock = vi.hoisted(() => ({
  params: "date=2026-10-05",
  data: [] as unknown[],
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  setState: vi.fn(),
  states: [] as unknown[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [mock.states.length ? mock.states.shift() : initial, mock.setState],
}));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mock.params) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.params = "date=2026-10-05";
  mock.data = [];
  mock.pending = false;
  mock.states = [];
});

it("loads careTasks.list for the date and renders every 06 column, grouped by local time", () => {
  mock.data = [
    task(),
    task({
      id: "00000000-0000-4000-8000-000000000002",
      taskType: "medication",
      title: "ให้ยา",
      medication: "ยาหยอดหู 2 หยด",
      petName: "ถั่วแดง",
      roomCode: "B2",
    }),
    task({
      id: "00000000-0000-4000-8000-000000000003",
      dueAt: "2026-10-05T11:00:00.000Z",
      status: "done",
      doneByName: "พี่บี",
      doneAt: "2026-10-05T11:05:00.000Z",
      note: "กินหมด",
    }),
  ];
  const html = renderToStaticMarkup(<CareTasksScreen />);
  for (const key of ["title", "time", "task", "petRoom", "status", "doneBy", "note", "done", "skip"] as const)
    expect(html).toContain(messages[key]);
  expect(mock.query).toHaveBeenCalledWith("careTasks.list", expect.objectContaining({ query: { date: "2026-10-05" } }));
  for (const text of ["08:00", "18:00", "โมจิ · A1", "ถั่วแดง · B2", "ยาหยอดหู 2 หยด", "พี่บี 18:05", "กินหมด", "🍚", "💊"])
    expect(html).toContain(text);
  expect(groupByTime(mock.data as never, "Asia/Bangkok").map(([time, tasks]) => [time, tasks.length])).toEqual([
    ["08:00 น.", 2],
    ["18:00 น.", 1],
  ]);
});

it("marks pending tasks over 30 minutes late in red; buttons only on pending rows", () => {
  const now = Date.parse("2026-10-05T01:31:00.000Z");
  expect(isOverdue(task() as never, now)).toBe(true);
  expect(isOverdue(task() as never, Date.parse("2026-10-05T01:30:00.000Z"))).toBe(false);
  expect(isOverdue(task({ status: "done" }) as never, now)).toBe(false);
  const props = { timezone: "Asia/Bangkok", now, busy: false, onDone: vi.fn(), onSkip: vi.fn() };
  const late = renderToStaticMarkup(
    <table>
      <tbody>
        <TaskRow task={task() as never} {...props} />
      </tbody>
    </table>,
  );
  expect(late).toContain(messages.overdue);
  expect(late).toContain("bg-destructive/10");
  const doneRow = renderToStaticMarkup(
    <table>
      <tbody>
        <TaskRow task={task({ status: "done" }) as never} {...props} />
      </tbody>
    </table>,
  );
  expect(doneRow).not.toContain("<button");
});

it("ทำแล้ว calls careTasks.done; ข้าม opens the reason dialog", () => {
  const onDone = vi.fn();
  const onSkip = vi.fn();
  const row = TaskRow({ task: task() as never, timezone: "Asia/Bangkok", now: 0, busy: false, onDone, onSkip });
  const buttons = row.props.children[6].props.children.props.children;
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ id: task().id }));
  expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ id: task().id }));
  renderToStaticMarkup(<CareTasksScreen />);
  expect(mock.mutation).toHaveBeenCalledWith("careTasks.done", expect.objectContaining({ invalidate: ["careTasks.list"] }));
  expect(mock.mutation).toHaveBeenCalledWith("careTasks.skip", expect.objectContaining({ invalidate: ["careTasks.list"] }));
});

it("the skip dialog requires a reason of at least 3 characters", async () => {
  const onSubmit = vi.fn();
  const form = (note: string) => {
    mock.states = [note, ""];
    return SkipDialog({ task: task() as never, pending: false, onCancel: vi.fn(), onSubmit }).props.children.props.children;
  };
  await form("ab").props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).not.toHaveBeenCalled();
  expect(mock.setState).toHaveBeenCalledWith(messages.skipInvalid);
  await form(" ฝนตก ").props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenCalledWith("ฝนตก");
});

it("loading and empty states", () => {
  expect(renderToStaticMarkup(<CareTasksScreen />)).toContain(messages.empty);
  mock.pending = true;
  expect(renderToStaticMarkup(<CareTasksScreen />)).toContain(messages.loading);
});
