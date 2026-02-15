"use client";

import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type PageGuideSection = {
  title: string;
  items: string[];
};

export type PageGuide = {
  title: string;
  summary: string;
  docsUrl?: string;
  sections: PageGuideSection[];
};

type PageGuideDialogProps = {
  guide: PageGuide;
  buttonLabel?: string;
};

export function PageGuideDialog({ guide, buttonLabel = "How-To" }: PageGuideDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen className="mr-2 h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>{guide.summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {guide.docsUrl && (
            <div>
              <a
                href={guide.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                Open VyOS Documentation
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {guide.sections.map((section) => (
            <section key={section.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {section.items.map((item) => (
                  <li key={`${section.title}-${item}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
