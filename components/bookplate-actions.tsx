"use client";
import { Download, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
export function BookplateActions({ copyId }: { copyId: string }) { return <div className="flex flex-wrap gap-2"><Button asChild variant="secondary"><a href={`/api/catalog/books/${copyId}/bookplate?format=svg`} download={`fangcun-${copyId}.svg`}><QrCode className="h-4 w-4" />下载 SVG 书标</a></Button><Button asChild variant="ghost"><a href={`/api/catalog/books/${copyId}/bookplate?format=png`} download={`fangcun-${copyId}.png`}><Download className="h-4 w-4" />下载 PNG</a></Button></div>; }
