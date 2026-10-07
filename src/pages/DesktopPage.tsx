import { useEffect, useRef } from "react";
import {
  MediaSlot,
  type DetailCloseRequest,
  type MediaSlotData,
} from "../components/MediaSlot";
import spatialSoundVideo from "../../Desktop image assets/Desktop images/1_AM_SpatialSound_1x1.mp4";
import xboxDiscordVideo from "../../Desktop image assets/Desktop images/2_Xbox_DiscordStreamscreen_1x1.mp4";
import xbox2030VisionVideo from "../../Desktop image assets/Desktop images/3_Xbox_2030_vision_16x9.mp4";
import gettyVideo from "../../Desktop image assets/Desktop images/4_GettyUnshuttered_2x3.mp4";
import gettyRestImage from "../../Desktop image assets/Desktop images/4_GettyUnshuttered_2x3_image.png";
import operaVideo from "../../Desktop image assets/Desktop images/5_Opera_1x1.mp4";
import operaRestImage from "../../Desktop image assets/Desktop images/5_Opera_1x1_image.jpg";
import operaDetailVideo from "../../Desktop image assets/Opera/Opera_1.mp4";
import operaSecondDetailVideo from "../../Desktop image assets/Opera/Opera_2.mp4";
import operaThirdDetailVideo from "../../Desktop image assets/Opera/Opera 3.mp4";
import gettyDetailImage1 from "../../Desktop image assets/Getty/Image1.jpg";
import gettyDetailImage2 from "../../Desktop image assets/Getty/Image2.jpg";
import gettyDetailImage3 from "../../Desktop image assets/Getty/Image3.jpg";
import gettyDetailImage4 from "../../Desktop image assets/Getty/Image4.jpg";
import gettyDetailImage6 from "../../Desktop image assets/Getty/Image6.jpg";
import gettyDetailImage7 from "../../Desktop image assets/Getty/Image7.jpg";
import gettyDetailImage8 from "../../Desktop image assets/Getty/Image8.jpg";
import gettyDetailImage9 from "../../Desktop image assets/Getty/Image9.jpg";
import gettyDetailImage10 from "../../Desktop image assets/Getty/Image10.jpg";
import gettyDetailVideo from "../../Desktop image assets/Getty/Getty video_1.mp4";
import gettyFountainSquareVideo from "../../Desktop image assets/Getty/Fountain_Sq.mp4";
import altCtrlYeahYeahYeahsVideo from "../../Desktop image assets/AM_T1_playlists/ALT_CNTRL_YeahYeahYeahs_16x9.mp4";
import altCtrlYeahYeahYeahsDetailVideo from "../../Desktop image assets/AM_T1_playlists/ALT_CNTRL_YeahYeahYeahs_21x9.mp4";
import dalePlayRosaliaDetailVideo from "../../Desktop image assets/AM_T1_playlists/Dale-play-rosalia_21x9.mp4";
import dxl03Video from "../../Desktop image assets/AM_T1_playlists/DXL_03.mp4";
import dxl04Video from "../../Desktop image assets/AM_T1_playlists/DXL_04.mp4";
import aListPopDuaLipaVideo from "../../Desktop image assets/AM_T1_playlists/A_list_pop_DuaLipa_1x1.mp4";
import superbloomGothBabeVideo from "../../Desktop image assets/AM_T1_playlists/Superbloom_GothBabe_1x1.mp4";
import todaysCountryVideo from "../../Desktop image assets/AM_T1_playlists/Todays_Country_1x1.mp4";
import rapLifeVideo from "../../Desktop image assets/AM_T1_playlists/Rap_life_1x1.mp4";
import dxl01Video from "../../Desktop image assets/AM_T1_playlists/DXL_01.mp4";
import nmd03Video from "../../Desktop image assets/AM_T1_playlists/NMD_03.mp4";
import xbox2030DetailVideo from "../../Desktop image assets/Single videos/Xbox 2030 vision.mp4";
import xboxDiscordDetailVideo from "../../Desktop image assets/Single videos/Discord x Xbox.mp4";
import xboxDiscord2DVideo from "../../Desktop image assets/Single videos/Discord x Xbox - 2D.mp4";
import anittaNycVideo from "../../Desktop image assets/AM_Spatial sound/Anitta_NYC.mp4";
import zeddMobileVideo from "../../Desktop image assets/AM_Spatial sound/Zedd_Mobile.mp4";
import zeddNycVideo from "../../Desktop image assets/AM_Spatial sound/Zedd_NYC.mp4";

const slots: MediaSlotData[] = [
  { id: "a", ratio: "16:9", layer: 1, projectLabel: "Project 01", projectTags: ["Editorial"] },
  { id: "b", ratio: "1:1", layer: 2, projectLabel: "Project 02", projectTags: ["Identity"] },
  {
    detailSlug: "opera-live-visuals",
    id: "c",
    ratio: "1:1",
    layer: 1,
    projectLabel: "Opera",
    projectTags: ["Live visuals"],
    imageSrc: operaRestImage,
    hoverVideoSrc: operaVideo,
    expandedVideoSrc: operaDetailVideo,
    alternateExpandedVideoSrc: operaSecondDetailVideo,
    thirdExpandedVideoSrc: operaThirdDetailVideo,
    restLabel: "Opera",
    expandedLabel: "Opera live visuals detail page",
    expandedTitle: "Live visuals to Opera & Tango",
    expandedSubtitleLines: [
      "I directed an animated opera for New Opera West, screened at the Hudson Guild Theatre alongside a live vocal performance by Brande N. Carrie. The visuals were also featured in a separate show, accompanying a live tango performed by Robert Wang.",
    ],
  },
  {
    detailSlug: "apple-music-playlists",
    id: "d",
    ratio: "16:9",
    layer: 1,
    projectLabel: "Apple music",
    projectTags: ["Brand system", "Playlists"],
    videoSrc: altCtrlYeahYeahYeahsVideo,
    expandedMediaSlides: [
      [{ source: altCtrlYeahYeahYeahsDetailVideo, type: "video" }],
      [{ source: dalePlayRosaliaDetailVideo, type: "video" }],
      [
        { source: dxl03Video, type: "video", initialTime: 6 },
        { source: dxl04Video, type: "video", initialTime: 6 },
      ],
      [
        { source: aListPopDuaLipaVideo, type: "video" },
        { source: superbloomGothBabeVideo, type: "video" },
      ],
      [
        { source: todaysCountryVideo, type: "video" },
        { source: rapLifeVideo, type: "video" },
      ],
      [
        { source: nmd03Video, type: "video", initialTime: 6 },
        { source: dxl01Video, type: "video", initialTime: 6 },
      ],
    ],
    restLabel: "ALT CTRL Yeah Yeah Yeahs",
    expandedLabel: "Apple music playlists detail page",
    expandedTitle: "Apple music playlists",
    expandedSubtitleLines: [
      "I designed a flexible system of Apple Music playlist idents, capturing the character of each genre while maintaining a cohesive Apple identity. Built to feature different artists within each genre, the system allowed playlists to evolve while retaining a consistent visual language.",
    ],
  },
  {
    detailSlug: "apple-music-spatial-audio",
    id: "e",
    ratio: "1:1",
    layer: 1,
    projectLabel: "Apple music",
    projectTags: ["Brand system", "Spatial audio"],
    videoSrc: spatialSoundVideo,
    expandedMediaSlides: [
      [{ source: anittaNycVideo, type: "video" }],
      {
        assets: [
          { source: zeddMobileVideo, type: "video" },
          { source: zeddNycVideo, type: "video" },
        ],
        layout: "spatial-pair",
      },
    ],
    restLabel: "AM_Spatial sound_Rest",
    expandedLabel: "AM_Spatial sound_DetailPage",
    expandedTitle: "Apple Music's Spatial Audio",
    expandedSubtitleLines: [
      "Apple Music’s MarCom team wanted to showcase new music releases available in Spatial Sound. I developed a simple visual language that brought the effect of Spatial Sound to life, alongside a flexible brand system designed to scale across large-format displays, desktop, and mobile",
    ],
  },
  { id: "f", ratio: "16:9", layer: 1, projectLabel: "Project 06", projectTags: ["Digital"] },
  { id: "g", ratio: "16:9", layer: 1, projectLabel: "Project 07", projectTags: ["Motion"] },
  {
    detailSlug: "xbox-2030",
    id: "h",
    ratio: "16:9",
    layer: 2,
    projectLabel: "Xbox 2030",
    projectTags: ["Product vision"],
    videoSrc: xbox2030VisionVideo,
    expandedVideoSrc: xbox2030DetailVideo,
    restLabel: "Xbox 2030 product vision",
    expandedLabel: "Xbox in 2030 detail page",
    expandedTitle: "Xbox in 2030",
    expandedSubtitleLines: [
      "I partnered with a small group of product leads to shape a vision for Xbox’s near future: making it effortless to jump into a game with anyone, bringing games together in one unified library, and championing open-source creation and personalization. Each area of that vision has since become part of the Xbox experience, reaching millions of players globally",
    ],
  },
  {
    detailSlug: "xbox-discord",
    id: "i",
    ratio: "1:1",
    layer: 2,
    projectLabel: "Xbox x Discord",
    projectTags: ["Brand Intro"],
    videoSrc: xboxDiscordVideo,
    expandedVideoSrc: xboxDiscordDetailVideo,
    alternateExpandedVideoSrc: xboxDiscord2DVideo,
    restLabel: "Xbox Discord stream screen",
    expandedLabel: "Xbox x Discord brand intro",
    expandedTitle: "Xbox x Discord launch screen",
    expandedSubtitleLines: [
      "I led the design of the stream launch screen for Xbox players sharing their gameplay on Discord, creating a shared brand moment before players go live with their audience. This exploration used looping circular motion and contrasts of light and dark to bring the visual identities of Xbox and Discord together",
    ],
  },
  { id: "j", ratio: "1:1", layer: 2, projectLabel: "Project 10", projectTags: ["Campaign"] },
  { id: "k", ratio: "2:3", layer: 2, projectLabel: "Project 11", projectTags: ["Print"] },
  { id: "l", ratio: "16:9", layer: 2, projectLabel: "Project 12", projectTags: ["Film"] },
  { id: "m", ratio: "16:9", layer: 3, projectLabel: "Project 13", projectTags: ["Digital"] },
  {
    detailSlug: "getty-unshuttered",
    id: "n",
    ratio: "2:3",
    layer: 3,
    projectLabel: "Getty Museum",
    projectTags: ["Projection", "Interactive"],
    imageSrc: gettyRestImage,
    hoverVideoSrc: gettyVideo,
    restLabel: "Getty",
    expandedMediaSlides: [
      {
        assets: [
          { source: gettyDetailImage1, type: "image" },
          { source: gettyVideo, type: "video" },
        ],
        layout: "wide-image",
      },
      [{ source: gettyDetailImage2, type: "image" }],
      [{ source: gettyDetailImage3, type: "image" }],
      [{ source: gettyDetailImage4, type: "image" }],
      [
        { source: gettyDetailVideo, type: "video" },
        { source: gettyDetailImage9, type: "image" },
      ],
      [{ source: gettyDetailImage6, type: "image" }],
      [{ source: gettyDetailImage7, type: "image" }],
      [{ source: gettyDetailImage8, type: "image" }],
      {
        assets: [
          { source: gettyFountainSquareVideo, type: "video" },
          { source: gettyDetailImage10, type: "image" },
        ],
        layout: "fountain-pair",
      },
    ],
    expandedLabel: "Getty Museum project details",
    expandedTitle: "Projections at the Getty Museum",
    expandedSubtitleLines: [
      "From 2018–2020, I worked with acclaimed director Mike Patterson to lead motion and design for Getty Unshuttered Live at the Getty Center in Los Angeles, combining projection mapping across seven buildings, live music, and an interactive Kinect installation. The event drew 2000+ guests and earned a Webby nomination",
    ],
    showExpandedCopyOnAllSlides: true,
  },
  { id: "o", ratio: "1:1", layer: 3, projectLabel: "Project 15", projectTags: ["Motion"] },
  { id: "p", ratio: "16:9", layer: 3, projectLabel: "Project 16", projectTags: ["Digital"] },
];

type DesktopPageProps = {
  closeDetailRequest: DetailCloseRequest;
};

export function DesktopPage({ closeDetailRequest }: DesktopPageProps) {
  const artboardRef = useRef<HTMLElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const artboard = artboardRef.current;
    if (!artboard) return;

    let activePointerId: number | null = null;
    let dragStartX = 0;
    let dragStartY = 0;
    let hasDragged = false;
    let suppressNextClick = false;
    let clickSuppressionTimeout: number | undefined;

    const updateCamera = (event: PointerEvent) => {
      if (
        document.body.classList.contains("has-detail-page-open")
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) return;

      const bounds = artboard.getBoundingClientRect();
      const pointerX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
      const pointerY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
      const yawRange = hasDragged ? 8 : 2;
      const tiltRange = hasDragged ? 10 : 3;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => {
        artboard.style.setProperty("--camera-x", `${pointerX * -yawRange}deg`);
        artboard.style.setProperty("--camera-y", `${pointerY * tiltRange}deg`);
        artboard.style.setProperty("--camera-z", "0deg");
      });
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;

      const pointerId = activePointerId;
      activePointerId = null;
      artboard.classList.remove("is-camera-dragging");
      suppressNextClick = hasDragged;
      hasDragged = false;

      if (clickSuppressionTimeout !== undefined) {
        window.clearTimeout(clickSuppressionTimeout);
      }
      clickSuppressionTimeout = window.setTimeout(() => {
        suppressNextClick = false;
        clickSuppressionTimeout = undefined;
      });

      if (artboard.hasPointerCapture(pointerId)) {
        artboard.releasePointerCapture(pointerId);
      }
    };

    const beginDrag = (event: PointerEvent) => {
      if (
        !event.isPrimary
        || event.button !== 0
        || document.body.classList.contains("has-detail-page-open")
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) return;

      activePointerId = event.pointerId;
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      hasDragged = false;
      suppressNextClick = false;
    };

    const trackDrag = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId) return;

      if (
        !hasDragged
        && Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) >= 6
      ) {
        hasDragged = true;
        artboard.classList.add("is-camera-dragging");
        artboard.setPointerCapture(event.pointerId);
      }
      updateCamera(event);
    };

    const suppressDraggedClick = (event: MouseEvent) => {
      if (!suppressNextClick) return;

      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const resetCameraWhenDetailsOpen = new MutationObserver(() => {
      if (!document.body.classList.contains("has-detail-page-open")) return;

      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      artboard.style.setProperty("--camera-x", "0deg");
      artboard.style.setProperty("--camera-y", "0deg");
      artboard.style.setProperty("--camera-z", "0deg");
    });
    resetCameraWhenDetailsOpen.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    window.addEventListener("pointermove", updateCamera, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    artboard.addEventListener("pointerdown", beginDrag);
    artboard.addEventListener("pointermove", trackDrag);
    artboard.addEventListener("click", suppressDraggedClick, true);

    return () => {
      resetCameraWhenDetailsOpen.disconnect();
      window.removeEventListener("pointermove", updateCamera);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      artboard.removeEventListener("pointerdown", beginDrag);
      artboard.removeEventListener("pointermove", trackDrag);
      artboard.removeEventListener("click", suppressDraggedClick, true);
      if (clickSuppressionTimeout !== undefined) window.clearTimeout(clickSuppressionTimeout);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  return (
    <main className="desktop-page">
      <section
        ref={artboardRef}
        className="artboard"
        aria-label="Layered portfolio canvas"
      >
        <div className="camera-stage">
          {slots.map((slot) => (
            <MediaSlot
              closeDetailRequest={closeDetailRequest}
              key={slot.id}
              slot={slot}
            />
          ))}
        </div>
      </section>
    </main>
  );
}