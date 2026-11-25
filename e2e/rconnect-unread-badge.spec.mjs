import { expect, test } from '@playwright/test';

function unsignedJwt(payload) {
  const encode=(value)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({alg:'none',typ:'JWT'})}.${encode(payload)}.test-signature`;
}
async function reply(route,body){
  await route.fulfill({status:200,contentType:'application/json',headers:{
    'access-control-allow-origin':'*','content-range':'0-1/2',
  },body:JSON.stringify(body)});
}
test('logged-in user sees only own unread R:Connect badge, and marking one read decrements it',async({page})=>{
  const userId='88888888-8888-4888-8888-888888888888';
  const user={
    id:userId,aud:'authenticated',role:'authenticated',email:'audit@example.invalid',
    app_metadata:{provider:'email',providers:['email']},user_metadata:{},
    created_at:'2026-10-21T00:00:00.000Z',updated_at:'2026-10-21T00:00:00.000Z',
  };
  const accessToken=unsignedJwt({aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,sub:userId});
  const notices=[
    {id:'00000000-0000-4000-8000-000000000001',recipient_id:userId,actor_id:null,post_id:null,star_letter_id:null,content_report_id:null,type:'resonance',message:'Test A',is_read:false,created_at:'2026-10-21T00:00:00.000Z'},
    {id:'00000000-0000-4000-8000-000000000002',recipient_id:userId,actor_id:null,post_id:null,star_letter_id:null,content_report_id:null,type:'archive',message:'Test B',is_read:false,created_at:'2026-10-21T00:00:01.000Z'},
    {id:'00000000-0000-4000-8000-000000000003',recipient_id:'other-user',actor_id:null,post_id:null,star_letter_id:null,content_report_id:null,type:'archive',message:'Private Other',is_read:false,created_at:'2026-10-21T00:00:01.000Z'},
  ];
  await page.route('**/__supabase/**',async(route)=>{
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,body:''});
    await reply(route,[]);
  });
  await page.route('**/__supabase/auth/v1/user',async(route)=>reply(route,user));
  await page.route('**/__supabase/rest/v1/notifications*',async(route)=>{
    if(route.request().method()==='PATCH'){
      const url=new URL(route.request().url());
      const id=url.searchParams.get('id')?.replace('eq.','');
      const notice=notices.find(n=>n.id===id && n.recipient_id===userId);
      if(notice)notice.is_read=true;
      await reply(route,notice??{});
      return;
    }
    await reply(route,notices);
  });
  await page.addInitScript(({stored})=>localStorage.setItem('sb-127-auth-token',JSON.stringify(stored)),{
    stored:{access_token:accessToken,expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,
      refresh_token:'unread-test-refresh',token_type:'bearer',user},
  });
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'星空Village bottom navigation'});
  const badge=page.getByTestId('rconnect-unread-badge');
  await expect(badge).toHaveText('2');
  await navigation.getByRole('button',{name:'Re:Connect',exact:true}).click();
  const buttons=page.getByRole('button',{name:'既読にする'});
  await expect(buttons).toHaveCount(2);
  await buttons.first().click();
  await expect(badge).toHaveText('1');
  await expect(buttons).toHaveCount(1);
  await buttons.first().click();
  await expect(badge).toHaveCount(0);

  // A new notification arrives after leaving Re:Connect. Re-entering
  // must fetch the updated list; do not depend on a full page reload.
  await navigation.getByRole('button',{name:'観測',exact:true}).click();
  notices.push({id:'00000000-0000-4000-8000-000000000004',recipient_id:userId,
    actor_id:null,post_id:null,star_letter_id:null,content_report_id:null,
    type:'star_letter',message:'New while away',is_read:false,
    created_at:'2026-10-21T00:00:04.000Z'});
  await navigation.getByRole('button',{name:'Re:Connect',exact:true}).click();
  await expect(badge).toHaveText('1');
});
