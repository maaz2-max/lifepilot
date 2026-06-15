import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" && process.env?.SUPABASE_URL) || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== "undefined" && process.env?.SUPABASE_ANON_KEY) || "";

export const supabase = supabaseUrl && supabaseAnonKey && supabaseUrl !== "undefined" && supabaseAnonKey !== "undefined"
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// General check
export const hasSupabase = () => {
  return !!supabase;
};

// --- Project API ---
export async function getCloudProject(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return data;
}

export async function getCloudProjectWithPIN(projectId, pin) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_projects")
    .select("*")
    .eq("id", projectId)
    .eq("pin", pin)
    .single();
  if (error) throw new Error("Incorrect PIN. Access Denied.");
  return data;
}

export async function createCloudProject(project) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_projects")
    .insert([project])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCloudProject(projectId, updates) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_projects")
    .update(updates)
    .eq("id", projectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCloudProject(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_projects")
    .delete()
    .eq("id", projectId);
  if (error) throw error;
  return true;
}

// --- Participants API ---
export async function getCloudParticipants(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_participants")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addCloudParticipant(projectId, name, role = "participant") {
  if (!supabase) throw new Error("Supabase client is not configured");
  
  // Check if participant already exists in the room
  const { data: existing } = await supabase
    .from("cloud_participants")
    .select("*")
    .eq("project_id", projectId)
    .eq("name", name);
    
  if (existing && existing.length > 0) {
    return existing[0];
  }

  const { data, error } = await supabase
    .from("cloud_participants")
    .insert([{ project_id: projectId, name, role }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeCloudParticipant(projectId, name) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_participants")
    .delete()
    .eq("project_id", projectId)
    .eq("name", name);
  if (error) throw error;
  return true;
}

// --- Expenses API ---
export async function getCloudExpenses(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_expenses")
    .select("*")
    .eq("project_id", projectId)
    .order("date", { ascending: false })
    .order("time", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertCloudExpense(expense) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_expenses")
    .upsert([expense])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCloudExpense(expenseId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_expenses")
    .delete()
    .eq("id", expenseId);
  if (error) throw error;
  return true;
}

// --- Chat Messages API ---
export async function getCloudMessages(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addCloudMessage(projectId, senderName, message) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_messages")
    .insert([{ project_id: projectId, sender_name: senderName, message }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function clearCloudMessages(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_messages")
    .delete()
    .eq("project_id", projectId);
  if (error) throw error;
  return true;
}

// --- Activity Log API ---
export async function getCloudActivities(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_activities")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addCloudActivity(projectId, actionType, description, createdBy) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_activities")
    .insert([{ project_id: projectId, action_type: actionType, description, created_by: createdBy }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Tasks / Reminders API ---
export async function getCloudTasks(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertCloudTask(task) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_tasks")
    .upsert([task])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCloudTask(taskId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_tasks")
    .delete()
    .eq("id", taskId);
  if (error) throw error;
  return true;
}

// --- Documents API ---
export async function getCloudDocuments(projectId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_documents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addCloudDocument(projectId, title, url, createdBy) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { data, error } = await supabase
    .from("cloud_documents")
    .insert([{ project_id: projectId, title, url, created_by: createdBy }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCloudDocument(documentId) {
  if (!supabase) throw new Error("Supabase client is not configured");
  const { error } = await supabase
    .from("cloud_documents")
    .delete()
    .eq("id", documentId);
  if (error) throw error;
  return true;
}
