import { useEffect, useRef } from "react";
import {
  MediaSlot,
  type DetailCloseRequest,
  type MediaSlotData,
} from "../components/MediaSlot";
import { videoMetadata } from "../video-metadata.generated";
import spatialSoundVideo from "../../delivery-media/Desktop images/1_AM_SpatialSound_1x1.mp4";
import xboxDiscordVideo from "../../delivery-media/Desktop images/2_Xbox_DiscordStreamscreen_1x1.mp4";
import xbox2030VisionVideo from "../../delivery-media/Desktop images/3_Xbox_2030_vision_16x9.mp4";
import gettyVideo from "../../delivery-media/Desktop images/4_GettyUnshuttered_2x3.mp4";
import gettyRestImage from "../../delivery-media/Desktop images/4_GettyUnshuttered_2x3_image.png.webp";
import operaVideo from "../../delivery-media/Desktop images/5_Opera_1x1.mp4";
import operaRestImage from "../../delivery-media/Desktop images/5_Opera_1x1_image.jpg.webp";
import weekndImage from "../../delivery-media/Desktop images/MM_weekend_noLogo.png.webp";
import xboxPcRedesignVideo from "../../delivery-media/Desktop images/Xbox_PC_Redesign_16x9.mp4";
import xboxCopilotVideo from "../../delivery-media/Desktop images/Xbox_copilot_16x9.mp4";
import xboxCopilotDetailVideo from "../../delivery-media/Xbox Copilot/Main copilot video.mp4";
import xboxCopilotImage1 from "../../delivery-media/Xbox Copilot/Image1_00000.png.webp";
import xboxCopilotImage2 from "../../delivery-media/Xbox Copilot/Image2_00000.png.webp";
import xboxCopilotImage3 from "../../delivery-media/Xbox Copilot/Image3_00000.png.webp";
import xboxCopilotImage4 from "../../delivery-media/Xbox Copilot/Image4_00000.png.webp";
import xboxCopilotImage5 from "../../delivery-media/Xbox Copilot/Image5_00000.png.webp";
import xboxCopilotImage6 from "../../delivery-media/Xbox Copilot/Image6_00000.png.webp";
import xboxCopilotImage7 from "../../delivery-media/Xbox Copilot/Image7_00000.png.webp";
import xboxCopilotImage8 from "../../delivery-media/Xbox Copilot/Image8_00000.png.webp";
import xboxCopilotImage9 from "../../delivery-media/Xbox Copilot/Image9_00000.png.webp";
import xboxCopilotImage10 from "../../delivery-media/Xbox Copilot/Image10_00000.png.webp";
import navigationIntroVideo from "../../delivery-media/Desktop images/Navigation_intro.mp4";
import navigationIntroDetailVideo from "../../delivery-media/Single videos/Navigation_intro.mp4";
import desktopNavigationImage from "../../delivery-media/Navigation/Desktop_nav.png.webp";
import xboxModeLowDensityImage from "../../delivery-media/Navigation/Xbox mode Low density.png.webp";
import desktopModeHighDensityImage from "../../delivery-media/Navigation/Desktop mode high density.png.webp";
import operaDetailVideo from "../../delivery-media/Opera/Opera_1.mp4";
import operaSecondDetailVideo from "../../delivery-media/Opera/Opera_2.mp4";
import operaThirdDetailVideo from "../../delivery-media/Opera/Opera 3.mp4";
import gettyDetailImage1 from "../../delivery-media/Getty/Image1.jpg.webp";
import gettyDetailImage2 from "../../delivery-media/Getty/Image2.jpg.webp";
import gettyDetailImage3 from "../../delivery-media/Getty/Image3.jpg.webp";
import gettyDetailImage4 from "../../delivery-media/Getty/Image4.jpg.webp";
import gettyDetailImage6 from "../../delivery-media/Getty/Image6.jpg.webp";
import gettyDetailImage7 from "../../delivery-media/Getty/Image7.jpg.webp";
import gettyDetailImage8 from "../../delivery-media/Getty/Image8.jpg.webp";
import gettyDetailImage9 from "../../delivery-media/Getty/Image9.jpg.webp";
import gettyDetailImage10 from "../../delivery-media/Getty/Image10.jpg.webp";
import gettyDetailVideo from "../../delivery-media/Getty/Getty video_1.mp4";
import gettyFountainSquareVideo from "../../delivery-media/Getty/Fountain_Sq.mp4";
import altCtrlYeahYeahYeahsVideo from "../../delivery-media/AM_T1_playlists/ALT_CNTRL_YeahYeahYeahs_16x9.mp4";
import altCtrlYeahYeahYeahsDetailVideo from "../../delivery-media/AM_T1_playlists/ALT_CNTRL_YeahYeahYeahs_21x9.mp4";
import dalePlayRosaliaDetailVideo from "../../delivery-media/AM_T1_playlists/Dale-play-rosalia_21x9.mp4";
import dxl03Video from "../../delivery-media/AM_T1_playlists/DXL_03.mp4";
import dxl04Video from "../../delivery-media/AM_T1_playlists/DXL_04.mp4";
import aListPopDuaLipaVideo from "../../delivery-media/AM_T1_playlists/A_list_pop_DuaLipa_1x1.mp4";
import superbloomGothBabeVideo from "../../delivery-media/AM_T1_playlists/Superbloom_GothBabe_1x1.mp4";
import todaysCountryVideo from "../../delivery-media/AM_T1_playlists/Todays_Country_1x1.mp4";
import rapLifeVideo from "../../delivery-media/AM_T1_playlists/Rap_life_1x1.mp4";
import dxl01Video from "../../delivery-media/AM_T1_playlists/DXL_01.mp4";
import nmd03Video from "../../delivery-media/AM_T1_playlists/NMD_03.mp4";
import xbox2030DetailVideo from "../../delivery-media/Single videos/Xbox 2030 vision.mp4";
import xboxDiscordDetailVideo from "../../delivery-media/Single videos/Discord x Xbox.mp4";
import xboxDiscord2DVideo from "../../delivery-media/Single videos/Discord x Xbox - 2D.mp4";
import xboxPcAfterImage1 from "../../delivery-media/Xbox PC app/After Image 1.png.webp";
import xboxPcBeforeImage1 from "../../delivery-media/Xbox PC app/Before 1.png.webp";
import xboxPcAfterImage2 from "../../delivery-media/Xbox PC app/After image 2.png.webp";
import xboxPcBeforeImage2 from "../../delivery-media/Xbox PC app/Befroe 2.png.webp";
import xboxPcAfterImage3 from "../../delivery-media/Xbox PC app/After Image 3.png.webp";
import xboxPcBeforeImage3 from "../../delivery-media/Xbox PC app/Before 3.png.webp";
import xboxPcAfterImage4 from "../../delivery-media/Xbox PC app/After Image 4.png.webp";
import anittaNycVideo from "../../delivery-media/AM_Spatial sound/Anitta_NYC.mp4";
import zeddMobileVideo from "../../delivery-media/AM_Spatial sound/Zedd_Mobile.mp4";
import zeddNycVideo from "../../delivery-media/AM_Spatial sound/Zedd_NYC.mp4";

const slots: MediaSlotData[] = [
  {
    detailSlug: "xbox-app-redesign",
    id: "a",
    ratio: "16:9",
    layer: 1,
    projectLabel: "Xbox app design",
    projectTags: ["Product"],
    imageSrc: videoMetadata[xboxPcRedesignVideo].poster,
    hoverVideoSrc: xboxPcRedesignVideo,
    expandedImageBorder: true,
    expandedMediaSlides: [
      [{ source: xboxPcAfterImage2, type: "image" }],
      [
        { source: xboxPcBeforeImage1, type: "image", caption: "Before" },
        { source: xboxPcAfterImage1, type: "image", caption: "After" },
      ],
      [
        { source: xboxPcBeforeImage2, type: "image", caption: "Before" },
        { source: xboxPcAfterImage3, type: "image", caption: "After" },
      ],
      [
        { source: xboxPcBeforeImage3, type: "image", caption: "Before" },
        { source: xboxPcAfterImage4, type: "image", caption: "After" },
      ],
    ],
    restLabel: "Xbox app design",
    expandedLabel: "Xbox app design detail page",
    expandedTitle: "Xbox App Design",
    expandedSubtitleLines: [
      "I led the redesign of the Xbox app landing experience to address low discovery and engagement. The redesign is centered around players’ games, interests, and communities, bringing together personalized recommendations, richer game information, social proof, friend activity, and customization",
    ],
  },
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
  {
    detailSlug: "xbox-navigation-system",
    id: "f",
    ratio: "16:9",
    layer: 1,
    projectLabel: "NAVIGATION",
    projectTags: ["SYSTEM", "PRODUCT"],
    imageSrc: videoMetadata[navigationIntroVideo].poster,
    hoverVideoSrc: navigationIntroDetailVideo,
    expandedVideoSrc: navigationIntroDetailVideo,
    expandedImageBorder: true,
    expandedMediaSlides: [
      [{ source: navigationIntroDetailVideo, type: "video" }],
      [{
        source: xboxModeLowDensityImage,
        type: "image",
        caption: "Xbox mode",
        specifications: [
          { label: "Player behaviour", value: "Sit back, relax & play. Probably on a couch at 10ft distance from the screen" },
          { label: "Devices", value: "Console, Handheld, Smart TV" },
          { label: "Input type", value: "Controller" },
          { label: "UI density", value: "Low density UI, immersive and less info dense, easily visible 10ft from the screen" },
          { label: "Navigation type", value: "Classic drill in IA, simple navigation" },
        ],
      }],
      [{
        source: desktopModeHighDensityImage,
        type: "image",
        caption: "Desktop mode",
        specifications: [
          { label: "Player behaviour", value: "Players at sitting up close, multi-tasking, wanting more control over aspects of their gameplay" },
          { label: "Devices", value: "PC, Web" },
          { label: "Input type", value: "Mouse & Keyboard" },
          { label: "UI density", value: "High density UI, supports more control on screen, flatter designs, ability to view more information at once" },
          { label: "Navigation type", value: "FLAT panel like IA, more navigation control" },
        ],
      }],
      [{ source: desktopNavigationImage, type: "image", bordered: false }],
    ],
    restLabel: "Xbox Navigation System preview",
    expandedLabel: "Xbox Navigation System detail page",
    expandedTitle: "Xbox Navigation System",
    expandedSubtitleLines: [
      "I led Xbox’s navigation systems across devices, platforms, and input types. The challenge was creating a familiar information architecture across the ecosystem while adapting navigation to each platform’s conventions and the way players interact, whether through a controller, mouse and keyboard, or touch. These rules were integrated into Xbox’s AI repository, helping designers and developers access the right navigation components and guidelines for their platform and input type",
    ],
  },
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
  {
    id: "j",
    ratio: "1:1",
    layer: 2,
    projectLabel: "The Weeknd",
    projectTags: ["Social Media"],
    imageSrc: weekndImage,
    restLabel: "The Weeknd",
    externalHref: "https://www.instagram.com/p/CSNq7TsFPeJ/",
  },
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
  {
    detailSlug: "xbox-copilot-ideation",
    id: "p",
    ratio: "16:9",
    layer: 3,
    projectLabel: "Xbox Copilot",
    projectTags: ["Product", "Storytelling"],
    imageSrc: videoMetadata[xboxCopilotVideo].poster,
    hoverVideoSrc: xboxCopilotVideo,
    restLabel: "Xbox Copilot preview",
    expandedLabel: "Xbox Copilot Ideation detail page",
    expandedTitle: "Xbox Copilot Ideation",
    expandedSubtitleLines: [
      "I worked with a small group of product leaders to explore how Xbox Copilot could solve meaningful problems for players. While the project never reached production following the cancellation of the broader Xbox Copilot initiative, the process and ideas felt worth sharing",
    ],
    expandedMediaSlides: [
      [{ source: xboxCopilotDetailVideo, type: "video" }],
      [{ source: xboxCopilotImage1, type: "image" }],
      [{ source: xboxCopilotImage2, type: "image" }],
      [{ source: xboxCopilotImage3, type: "image" }],
      [{ source: xboxCopilotImage4, type: "image" }],
      [{ source: xboxCopilotImage5, type: "image" }],
      [{ source: xboxCopilotImage6, type: "image" }],
      [{ source: xboxCopilotImage7, type: "image" }],
      [{ source: xboxCopilotImage8, type: "image" }],
      [{ source: xboxCopilotImage9, type: "image" }],
      [{ source: xboxCopilotImage10, type: "image" }],
    ],
  },
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