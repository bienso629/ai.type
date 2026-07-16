const now = new Date();
let currentTime = new Date(now);
currentTime.setHours(8, 0, 0, 0);
const aiResults = new Array(5).fill({});
const totalWorkMinutes = 14 * 60;
const minutesPerTask = Math.floor(totalWorkMinutes / aiResults.length);

for (let i = 0; i < aiResults.length; i++) {
    let taskStart = new Date(currentTime);
    let taskEnd = new Date(currentTime);
    taskEnd.setMinutes(taskEnd.getMinutes() + minutesPerTask);
    console.log(`Task ${i}: start=${taskStart.toISOString()} end=${taskEnd.toISOString()}`);
    currentTime = new Date(taskEnd);
}
