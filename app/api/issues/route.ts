import{NextResponse}from"next/server";import{getIssues}from"../../../lib/store";export async function GET(){return NextResponse.json(await getIssues())}
