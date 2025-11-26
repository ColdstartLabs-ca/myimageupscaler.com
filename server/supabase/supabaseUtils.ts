import { supabase } from '@server/supabase/supabaseClient';

export async function getItems<T>(table: string): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data as T[] | null;
}

export async function addItem<T>(table: string, item: T): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).insert([item]);
  if (error) throw error;
  return data as T[] | null;
}

export async function updateItem<T>(
  table: string,
  id: string,
  updates: Partial<T>
): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).update(updates).eq('id', id);
  if (error) throw error;
  return data as T[] | null;
}

export async function deleteItem<T>(table: string, id: string): Promise<T[] | null> {
  const { data, error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  return data as T[] | null;
}
