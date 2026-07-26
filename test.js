const url1 = "https://tadu.cloud";
const url2 = "tadu.cloud";
const clean = (url) => (url || '').replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
console.log(clean(url1) === clean(url2));
