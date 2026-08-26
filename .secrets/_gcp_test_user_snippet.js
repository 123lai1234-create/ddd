// 完整流程：點 Add users → 填 email → 按 Add → 按 Save → 驗證
// 跑在 https://console.cloud.google.com/auth/audience?project=herms-496408
(async () => {
  const DQ = (s, r=document) => {
    const a = [...r.querySelectorAll(s)];
    r.querySelectorAll('*').forEach(el => { if (el.shadowRoot) a.push(...DQ(s, el.shadowRoot)); });
    return a;
  };

  console.log('STEP 1: Find Add users button');
  const allButtons = DQ('button');
  console.log('  Total buttons:', allButtons.length);
  const addBtn = allButtons.find(b => /add\s*users/i.test((b.textContent || '').trim()));
  if (!addBtn) {
    console.log('  NOT FOUND. List:');
    allButtons.forEach((b, i) => console.log(`    [${i}] "${(b.textContent||'').trim().slice(0,50)}"`));
    return;
  }
  console.log('  Found:', addBtn.textContent.trim());
  addBtn.click();
  console.log('  Clicked.');
  await new Promise(r => setTimeout(r, 1500));

  console.log('STEP 2: Find email input');
  const inputs = DQ('input').filter(i => !i.disabled && (i.type === 'text' || i.type === 'email' || !i.type));
  console.log('  Total inputs:', inputs.length);
  if (!inputs.length) { console.log('  NOT FOUND'); return; }
  const emailInput = inputs[0];
  emailInput.focus();
  const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeSet.call(emailInput, 'jtlai0921@gmail.com');
  emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  emailInput.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('  Typed email.');
  await new Promise(r => setTimeout(r, 500));

  console.log('STEP 3: Find Add button in dialog');
  const addDialog = DQ('button').find(b => /^(add|新增)$/i.test((b.textContent||'').trim()));
  if (addDialog) { addDialog.click(); console.log('  Clicked Add.'); }
  else { console.log('  NOT FOUND. You need to click the "新增"/"Add" button in the dialog manually.'); }
  await new Promise(r => setTimeout(r, 1500));

  console.log('STEP 4: Find Save button on main page');
  const saveBtn = DQ('button').find(b => /^(save|儲存|儲存變更|save changes)$/i.test((b.textContent||'').trim()));
  if (saveBtn) { saveBtn.click(); console.log('  Clicked Save.'); }
  else { console.log('  NOT FOUND. Look for blue "儲存" button at the bottom of the page.'); }
  await new Promise(r => setTimeout(r, 2000));

  console.log('STEP 5: Verify');
  const allText = document.body.textContent;
  const m = allText.match(/(\d+)\s*位使用/);
  console.log('  User count:', m ? m[0] : 'NOT FOUND');
  console.log('DONE. F5 to reload and confirm.');
})();
