// Format stored calendar dates without timezone conversion or changing their ISO values.
export function displayDate(value: string): string {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (day) return `${day[3]}/${day[2]}/${day[1]}`;
    const month = /^(\d{4})-(\d{2})$/.exec(value);
    return month ? `${month[2]}/${month[1]}` : value;
}
