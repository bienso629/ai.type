const validDates = new Array(10).fill(new Date());
const contextData = [
  { domain: 'type.vn', monthlyTarget: 10, currentResult: 0 }
];

const domainDistributions = {};
contextData.forEach((d) => {
    let missing = d.monthlyTarget - d.currentResult;
    if (missing < 0) missing = 0;
    
    let distribution = new Array(validDates.length).fill(Math.floor(missing / validDates.length));
    let remainder = missing % validDates.length;
    if (remainder > 0) {
        let step = Math.max(1, Math.floor(validDates.length / remainder));
        for (let r = 0; r < remainder; r++) {
            distribution[(r * step) % validDates.length]++;
        }
    }
    domainDistributions[d.domain] = distribution;
});

console.log(domainDistributions);
