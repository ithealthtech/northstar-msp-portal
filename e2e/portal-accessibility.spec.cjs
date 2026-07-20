'use strict';
const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;

const roleButtons={user:'Preview end-user portal',admin:'Preview client-admin portal',msp:'Preview MSP management'};

async function openRole(page,role){
  await page.goto('/');
  await page.getByRole('button',{name:roleButtons[role],exact:true}).click();
  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#portal')).toBeVisible();
  await expect(page.locator('#content h1')).toHaveCount(1);
}

async function expectNoWcagViolations(page){
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  const summary=result.violations.map((violation)=>({
    id:violation.id,
    nodes:violation.nodes.map((node)=>({
      target:node.target,
      data:node.any[0]?.data
    }))
  }));
  expect(summary).toEqual([]);
}

test('login passes automated WCAG A/AA checks',async({page})=>{
  await page.goto('/');
  await expectNoWcagViolations(page);
});

for(const role of Object.keys(roleButtons)){
  test(`${role} dashboard passes automated WCAG A/AA checks`,async({page})=>{
    await openRole(page,role);
    await expectNoWcagViolations(page);
  });
}

test('skip link and page navigation move keyboard focus to meaningful content',async({page})=>{
  await openRole(page,'admin');
  await page.keyboard.press('Tab');
  const skip=page.getByRole('link',{name:'Skip to main content'});
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#mainContent')).toBeFocused();
  await page.getByRole('button',{name:/Support requests/}).click();
  await expect(page.getByRole('heading',{name:'How can we help?',level:1})).toBeFocused();
});

test('support dialog traps focus, closes with Escape, and restores the opener',async({page})=>{
  await openRole(page,'admin');
  const opener=page.getByRole('button',{name:/New support request/}).first();
  await opener.click();
  const dialog=page.getByRole('dialog',{name:'How can we help?'});
  await expect(dialog).toBeVisible();
  await expect(page.locator('#ticketSubject')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('mobile navigation exposes state and the portal avoids horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await openRole(page,'user');
  const menu=page.getByRole('button',{name:'Open navigation'});
  await expect(menu).toHaveAttribute('aria-expanded','false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded','true');
  const dimensions=await page.locator('html').evaluate(element=>({scrollWidth:element.scrollWidth,clientWidth:element.clientWidth}));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
