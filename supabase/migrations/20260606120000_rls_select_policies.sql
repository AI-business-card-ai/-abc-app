-- Ensure explicit SELECT policies for owner-only reads
drop policy if exists "contacts_select_own" on public.scanned_contacts;
create policy "contacts_select_own" on public.scanned_contacts
  for select using (auth.uid() = user_id);

drop policy if exists "followups_select_own" on public.followup_sequences;
create policy "followups_select_own" on public.followup_sequences
  for select using (auth.uid() = user_id);
