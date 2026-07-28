const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw4DyIXu0RYzZSG1wm434wOFKhNdknyYNEVg7TNC2kq46ptHuno2aGndhnKpmYpSTWSlw/exec";

export async function getTransactions() 
{
  const res = await fetch(APPS_SCRIPT_URL);
  const data = await res.json();
  return data;
}

export async function getCategories() 
{
  const res = await fetch(`${APPS_SCRIPT_URL}?action=getCategories`);
  const data = await res.json();
  return data;
}

export async function saveTransaction(payload) 
{
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.json();
}