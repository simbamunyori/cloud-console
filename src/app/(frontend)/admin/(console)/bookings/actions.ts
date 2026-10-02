"use server";

import { revalidatePath } from "next/cache";
import { requireStaffCan } from "@/server/admin/context";
import { field, run, type ActionState } from "@/server/action-state";
import { prisma } from "@/server/db";
import { runSoon } from "@/server/jobs/boss";
import { cancelByStaff, saveAvailability, type Hours } from "@/server/presales/booking";

export async function saveHoursAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("viewCustomers");
  const hours: Hours[] = [];
  for (let day = 1; day <= 7; day++) {
    if (field(form, `day${day}`) !== "on") continue;
    hours.push({ day, from: field(form, `from${day}`), to: field(form, `to${day}`) });
  }
  const result = await run(async () => {
    await saveAvailability(prisma, staff, { active: field(form, "active") === "on", meetingUrl: field(form, "meetingUrl"), hours, timeZone: field(form, "timeZone") || "Africa/Gaborone" });
    return "Saved. Visitors can book the free half-hours in these times.";
  });
  revalidatePath("/admin/bookings");
  revalidatePath("/[market]", "layout");
  return result;
}

export async function cancelBookingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { staff } = await requireStaffCan("viewCustomers");
  const result = await run(async () => {
    await cancelByStaff(prisma, staff, field(form, "reference"));
    await runSoon("email-deliver").catch(() => undefined);
    return "Cancelled. The visitor has been told.";
  });
  revalidatePath("/admin/bookings");
  return result;
}
