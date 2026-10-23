export type CalendarMonth = {
  year: number;
  month: number;
  cells: CalendarDay[];
  startDate: Date;
  endDate: Date;
  previous: CalendarMonthLink;
  next: CalendarMonthLink;
};

export type CalendarDay = {
  date: Date;
  dateKey: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

export type CalendarMonthLink = {
  year: number;
  month: number;
};

const calendarCellCount = 42;
const minCalendarYear = 1900;
const maxCalendarYear = 9999;

export function resolveCalendarMonth(
  input: { year?: string | string[]; month?: string | string[] },
  today = new Date(),
) {
  const year = parseSingleNumber(input.year);
  const month = parseSingleNumber(input.month);

  if (
    year &&
    year >= minCalendarYear &&
    year <= maxCalendarYear &&
    month &&
    month >= 1 &&
    month <= 12
  ) {
    return { year, month };
  }

  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  };
}

export function buildCalendarMonth(
  year: number,
  month: number,
  today = new Date(),
): CalendarMonth {
  const monthIndex = month - 1;
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const startDate = addDays(firstDayOfMonth, -firstDayOfMonth.getDay());
  const cells = Array.from({ length: calendarCellCount }, (_, index) => {
    const date = addDays(startDate, index);

    return {
      date,
      dateKey: formatDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === monthIndex,
      isToday: formatDateKey(date) === formatDateKey(today),
    };
  });

  return {
    year,
    month,
    cells,
    startDate,
    endDate: addDays(startDate, calendarCellCount),
    previous: getMonthLink(year, month, -1),
    next: getMonthLink(year, month, 1),
  };
}

export function parseDateKey(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999) return undefined;
  const date = new Date(year, month - 1, day);
  return formatDateKey(date) === value ? date : undefined;
}

export function formatDateKey(date: Date) {
  const fullYear = date.getFullYear();
  const year =
    fullYear >= 0 && fullYear <= 9999
      ? String(fullYear).padStart(4, "0")
      : `${fullYear < 0 ? "-" : "+"}${String(Math.abs(fullYear)).padStart(6, "0")}`;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatMonthTitle(year: number, month: number, locale = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

export function buildExerciseMonthlyTrend(
  sets: { reps: number; weight: number; workout: { date: Date } }[],
  locale: string,
  today: Date,
) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth() - (5 - index),
      1,
    );
    return {
      key: formatMonthKey(date),
      label: date.toLocaleDateString(locale, { month: "short" }),
      volume: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  for (const set of sets) {
    const month = monthByKey.get(formatMonthKey(set.workout.date));
    if (month) month.volume += set.weight * set.reps;
  }
  return months;
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLink(year: number, month: number, offset: -1 | 1) {
  const date = new Date(year, month - 1 + offset, 1);

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseSingleNumber(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue || !/^\d+$/.test(rawValue)) {
    return null;
  }

  return Number(rawValue);
}
