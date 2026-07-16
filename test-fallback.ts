const existingDomain = {
  childrenItems: [
    {
      id: "domain-child",
      name: "Công việc",
      streamItems: [{ id: "t1", name: "Task 16th" }, { id: "t2", name: "Task 17th" }]
    }
  ]
};
let newTasks = existingDomain.childrenItems?.[0]?.streamItems ? [...existingDomain.childrenItems[0].streamItems] : (existingDomain.childrenItems?.length ? [...existingDomain.childrenItems] : []);
console.log(newTasks);
