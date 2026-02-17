import { redirect } from "next/navigation";

export default function SystemServicesDnsPage() {
  redirect("/system/services?tab=dns&view=single");
}
