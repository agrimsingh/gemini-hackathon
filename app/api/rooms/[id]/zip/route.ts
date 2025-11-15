import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import JSZip from "jszip";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;

  const { data: files, error } = await supabaseAdmin
    .from("files")
    .select("path, content")
    .eq("room_id", roomId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 }
    );
  }

  const zip = new JSZip();

  if (files) {
    files.forEach((file) => {
      zip.file(file.path, file.content);
    });
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const arrayBuffer = await zipBlob.arrayBuffer();

  return new NextResponse(arrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dream-sandbox-${roomId.slice(
        0,
        8
      )}.zip"`,
    },
  });
}
