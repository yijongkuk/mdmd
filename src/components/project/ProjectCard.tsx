'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Trash2, ExternalLink, Boxes, Ruler, Banknote, MapPin, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatWon, formatArea, formatDate } from '@/lib/utils/format';
import type { ProjectSummary } from '@/types/project';

interface ProjectCardProps {
  project: ProjectSummary;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ProjectCard({ project, onDelete, onRename }: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed);
    } else {
      setEditValue(project.name);
    }
    setEditing(false);
  }, [editValue, project.name, project.id, onRename]);

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-1.5">
          {editing ? (
            <input
              ref={inputRef}
              className="flex-1 rounded border border-blue-300 px-2 py-1 text-base font-bold text-slate-900 outline-none focus:ring-1 focus:ring-blue-400"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setEditValue(project.name); setEditing(false); }
              }}
            />
          ) : (
            <>
              <CardTitle className="flex-1 text-base font-bold leading-tight">
                {project.name}
              </CardTitle>
              <button
                className="mt-0.5 shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                onClick={() => setEditing(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400">
          {formatDate(project.createdAt)}
        </p>
        {project.parcelPnu && (
          <p className="flex items-center gap-1 text-xs text-blue-600">
            <MapPin className="h-3 w-3" />
            {project.parcelPnu}
          </p>
        )}
        {project.description && (
          <p className="text-sm text-slate-500 line-clamp-2">
            {project.description}
          </p>
        )}
      </CardHeader>

      <CardContent>
        <div className="mb-4 flex items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1">
            <Boxes className="h-3.5 w-3.5" />
            {project.totalModules}개
          </span>
          <span className="flex items-center gap-1">
            <Ruler className="h-3.5 w-3.5" />
            {formatArea(project.totalArea)}
          </span>
          <span className="flex items-center gap-1">
            <Banknote className="h-3.5 w-3.5" />
            {formatWon(project.totalCost)}
          </span>
        </div>

        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/builder/${project.id}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              열기
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(project.id)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
