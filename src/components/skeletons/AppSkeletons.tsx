import { Skeleton } from "@/components/ui/skeleton";

const UPLOADED_IMAGE_SHAPES = [
  { width: 156, height: 94 },
  { width: 184, height: 116 },
  { width: 210, height: 130 },
  { width: 168, height: 108 },
] as const;

const getUploadedImageShape = (index: number) => UPLOADED_IMAGE_SHAPES[index % UPLOADED_IMAGE_SHAPES.length];

export const AuthGateSkeleton = () => (
  <div className="min-h-screen bg-background p-4 flex items-center justify-center">
    <div className="w-full max-w-sm space-y-7">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-full" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-11/12" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-10 w-10/12" />
        <Skeleton className="h-10 w-2/3 ml-auto mr-auto" />
      </div>
    </div>
  </div>
);

export const ServerRailSkeleton = ({ sheet = false }: { sheet?: boolean }) => (
  <div className={sheet ? "h-full w-full bg-channel-bar p-3 space-y-4" : "w-[72px] shrink-0 bg-server-bar py-3 px-3 space-y-3"}>
    {sheet ? (
      <>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-14" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-md" style={{ width: `${60 + ((i * 8) % 18)}%` }} />
        ))}
      </>
    ) : (
      <>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-11 rounded-2xl" />
        ))}
      </>
    )}
  </div>
);

export const ChannelSidebarSkeleton = ({ embedded = false }: { embedded?: boolean }) => (
  <div className={`shrink-0 bg-channel-bar ${embedded ? "w-full h-full" : "w-60"} flex flex-col`}>
    <div className="p-3">
      <Skeleton className="h-9 w-3/4 rounded-md" />
    </div>
    <div className="flex-1 px-2 py-2 space-y-4">
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-2.5">
          <Skeleton className="h-3 w-16 ml-1" />
          {Array.from({ length: 4 }).map((__, row) => (
            <div key={row} className="flex items-center gap-2.5 px-1">
              <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
              <Skeleton className="h-7 rounded-md" style={{ width: `${42 + ((section + row) * 6) % 14}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="p-3 pt-2">
      <Skeleton className="h-9 w-2/3 rounded-md" />
    </div>
  </div>
);

export const DMSidebarSkeleton = ({ embedded = false }: { embedded?: boolean }) => (
  <div className={`shrink-0 bg-channel-bar ${embedded ? "w-full h-full" : "w-60"} flex flex-col`}>
    <div className="h-12 px-4 flex items-center">
      <Skeleton className="h-5 w-24" />
    </div>
    <div className="px-2 py-2 space-y-3">
      <Skeleton className="h-9 w-10/12 rounded-md" />
      <Skeleton className="h-9 w-3/4 rounded-md" />
    </div>
    <div className="flex-1 px-2 py-2 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          {i % 2 === 0 && <Skeleton className="h-8 w-8 rounded-full shrink-0" />}
          <div className="flex items-center gap-2 flex-1">
            <Skeleton className="h-9 rounded-md" style={{ width: `${34 + (i * 6) % 16}%` }} />
            {i % 3 === 1 && <Skeleton className="h-9 rounded-md" style={{ width: `${18 + (i * 4) % 10}%` }} />}
          </div>
        </div>
      ))}
    </div>
    <div className="p-3 pt-2">
      <Skeleton className="h-9 w-2/3 rounded-md" />
    </div>
  </div>
);

export const ChatAreaSkeleton = ({ forum = false }: { forum?: boolean }) => (
  <div className="flex flex-1 min-w-0 bg-chat-area">
    <div className="flex flex-col flex-1 min-w-0">
      <div className="h-12 px-4 flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-10 rounded-md" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {Array.from({ length: forum ? 6 : 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-start">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3.5" style={{ width: `${18 + (i * 6) % 14}%` }} />
                {i % 3 !== 0 && <Skeleton className="h-3.5" style={{ width: `${12 + (i * 5) % 10}%` }} />}
              </div>
              <Skeleton className="h-3.5" style={{ width: `${30 + (i * 8) % 16}%` }} />
              {i % 2 === 0 && (
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-3" style={{ width: `${16 + (i * 6) % 12}%` }} />
                  <Skeleton className="h-3" style={{ width: `${12 + (i * 4) % 10}%` }} />
                </div>
              )}
              {i % 4 === 1 && (
                <Skeleton
                  className="rounded-md"
                  style={getUploadedImageShape(i + 3)}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {!forum && (
        <div className="px-4 pb-5 pt-2">
          <Skeleton className="h-11 w-11/12 rounded-lg" />
        </div>
      )}
    </div>
  </div>
);

export const DMAreaSkeleton = () => (
  <div className="flex flex-col flex-1 min-w-0 bg-chat-area">
    <div className="h-12 px-4 flex items-center">
      <Skeleton className="h-5 w-24" />
    </div>
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-start">
          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-3.5" style={{ width: `${18 + (i * 6) % 14}%` }} />
              {i % 3 !== 2 && <Skeleton className="h-3.5" style={{ width: `${12 + (i * 5) % 11}%` }} />}
            </div>
            <Skeleton className="h-3.5" style={{ width: `${30 + (i * 8) % 16}%` }} />
            {i % 2 === 1 && (
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3" style={{ width: `${15 + (i * 5) % 12}%` }} />
                <Skeleton className="h-3" style={{ width: `${11 + (i * 4) % 10}%` }} />
              </div>
            )}
            {i % 4 === 1 && (
              <Skeleton
                className="rounded-md"
                style={getUploadedImageShape(i + 1)}
              />
            )}
          </div>
        </div>
      ))}
    </div>
    <div className="px-4 pb-6 pt-1">
      <Skeleton className="h-11 w-11/12 rounded-lg" />
    </div>
  </div>
);

export const MemberSidebarSkeleton = ({ forceVisible = false }: { forceVisible?: boolean }) => (
  <div className={`${forceVisible ? "w-full h-full block" : "w-60 hidden lg:block"} bg-member-bar shrink-0`}>
    <div className="px-4 py-4 space-y-4">
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-2.5">
          <Skeleton className="h-3 w-14" />
          {Array.from({ length: 4 }).map((__, row) => (
            <div key={row} className="flex items-center gap-3.5">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3.5" style={{ width: `${22 + ((section + row) * 8) % 16}%` }} />
                {row % 2 === 1 && <Skeleton className="h-3.5" style={{ width: `${12 + ((section + row) * 6) % 10}%` }} />}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const DiscoverGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="p-1.5 space-y-3">
        <Skeleton className="h-24 w-11/12 rounded-lg" />
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3.5" style={{ width: `${18 + (i * 7) % 13}%` }} />
                {i % 2 === 0 && <Skeleton className="h-3.5" style={{ width: `${12 + (i * 5) % 9}%` }} />}
              </div>
              <Skeleton className="h-3" style={{ width: `${20 + (i * 7) % 18}%` }} />
            </div>
          </div>
          <Skeleton className="h-9 w-1/2 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);

export const ProfilePageSkeleton = () => (
  <div className="min-h-screen bg-chat-area text-foreground">
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <Skeleton className="h-7 w-14" />
      <Skeleton className="h-32 sm:h-40 w-11/12 rounded-xl" />
      <div className="flex items-end gap-4">
        <Skeleton className="h-16 w-16 sm:h-20 sm:w-20 rounded-full" />
        <div className="space-y-2.5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-3">
          <Skeleton className="h-9 w-10/12" />
          <Skeleton className="h-20 w-11/12" />
          <Skeleton className="h-9 w-9/12" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11" style={{ width: `${54 + (i * 9) % 26}%` }} />
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const ServerSettingsSkeleton = () => (
  <div className="min-h-screen bg-chat-area">
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
        <div className="p-1 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded-md" style={{ width: `${48 + (i * 8) % 28}%` }} />
          ))}
        </div>
        <div className="space-y-3.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-14 w-10/12" />
          <Skeleton className="h-9 w-1/3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="h-9" style={{ width: `${36 + (i * 7) % 18}%` }} />
              {i % 2 === 0 && <Skeleton className="h-9" style={{ width: `${18 + (i * 5) % 12}%` }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const DialogListSkeleton = ({
  rows = 3,
  withAvatar = true,
  withImage = true,
}: {
  rows?: number;
  withAvatar?: boolean;
  withImage?: boolean;
}) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="space-y-2.5 py-1.5">
        <div className="flex items-start gap-3">
          {withAvatar && i % 2 === 0 ? (
            <Skeleton className="h-8 w-8 rounded-full shrink-0 mt-0.5" />
          ) : null}
          <div className="space-y-2.5 min-w-0">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-3.5" style={{ width: `${16 + (i * 8) % 12}%` }} />
              {i % 2 === 1 && <Skeleton className="h-3.5" style={{ width: `${11 + (i * 6) % 9}%` }} />}
            </div>
            <Skeleton className="h-3.5" style={{ width: `${28 + (i * 8) % 16}%` }} />
            {i % 2 === 0 && (
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3" style={{ width: `${15 + (i * 6) % 11}%` }} />
                <Skeleton className="h-3" style={{ width: `${11 + (i * 5) % 9}%` }} />
              </div>
            )}
            {withImage && i % 3 === 1 && (
              <Skeleton
                className="rounded-md"
                style={getUploadedImageShape(i + 2)}
              />
            )}
          </div>
        </div>
      </div>
    ))}
  </div>
);
