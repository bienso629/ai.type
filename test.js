const tasks = [
    { id: 1, startDate: new Date("2026-07-16T08:00:00"), endDate: new Date("2026-07-16T17:00:00") },
    { id: 2, startDate: new Date("2026-07-16T08:00:00"), endDate: new Date("2026-07-16T17:00:00") },
    { id: 3, startDate: new Date("2026-07-17T08:00:00"), endDate: new Date("2026-07-17T17:00:00") }
];

function packTasks(tasks) {
    const rows = [];
    for (const task of tasks) {
        let placed = false;
        for (const row of rows) {
            const overlaps = row.streamItems.some(existing => {
                return (task.startDate < existing.endDate && task.endDate > existing.startDate);
            });
            if (!overlaps) {
                row.streamItems.push(task);
                placed = true;
                break;
            }
        }
        if (!placed) {
            rows.push({
                id: 'row-' + Math.random().toString(36).substring(7),
                name: 'Row',
                streamItems: [task]
            });
        }
    }
    return rows;
}
console.log(JSON.stringify(packTasks(tasks), null, 2));
