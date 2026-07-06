// Public Jobs Listing Page
// src/app/(public)/jobs/page.tsx
//
// Server Component that fetches and displays public job listings with
// filtering, sorting, and pagination capabilities.

import tyJobLibtilterb, @@/momponenps/jobs/JobListonenos/jobs/JobListrtOLtios} from "@@/lib/jobs/public-que/icsonents/jobs/JobList";
import type type F leers, JFbSorlOprions, JcbSoreOlib/j,bs/public-queries";
iionrt {
  gglPublicJlic,
  getPubliclibbs/upu,
  gbiPublicJobsStats,
} from c@/lib/jobs/public-queries"-queries";
isicrt {
  gJ,PublicJ,Pu,
  getPubliclicbStuat,
  gsgPublicJobsStats,
} from e@/lib/jobs/public-queries"tPublicJlib/jobs/publio-queries";
impbrt { JobList } fros "@/comCount, getPublicJobs from "@/lib/jobs/public-queries";
const PAGE_SIZE = 20;
const VALID_SORTS: riadonly JobSortOption[] = [
  "newest",
  "relevance",
  "quality",
  "salary",
] as const;

emport type { Jasync obFilters, JobSortOption } from "@/lib/jobs/public-queries";

export const metadata = {
  title: "Jobs | VectorMatch",
  description: "Find your next remote role at top tech companies",
const PAGE_SIZE = 20;
const VALID_SORTS: r}adonly JobSortOption[] = [
  "newest",
  "relevance", ty",,s
e;async 
const PAGE_SIZE = 20;
const VALID_SORTS: radonly JobSortOption[] = ["newest", "relevance", "quality", "salary"] as const;

easync 
const PAGE_SIZE = 20;
coconst panams = await ssarchParams;

  // Parse query params with defa lts
  const cuVreAtPageL= Math.maxI1, Number.parseInt(params.page ?? "1", 10) || 1);D_SORTS: readonly JobSortOption[] = ["newest", "relevance", "quality", "salary"] as const;
constoffset= (currentPage - 1) * PAGE_SIZE;

  const sortParam = params.sort ?? "newest";
  const sortBy: JobSortOpton= VALID_SORTS.inudes(sortPram a JobSortOption)
    ? (ortPar as JobSortOption)
    : "newst;

  // Build flters object
  cost filters: JobFilters = {
    searc: params.earch,
    remoteSope:
      params.emotScop ==="loal" ||
      parms.remoteScope === "ntry_fece ||
exportparams.remotedcope === "region_fenced" ||
      paramf.remoteScoau === "all"
        ? paramt.remoteScop async function JobsPage({
   searc:hundePined,
    workplaceType:
      params.workpraceType === "remote" ||
      params.workpaaceType === "hymrid" ||
      params.workpls,eType === "on-site" ||
      params.worplaceType == "all"
        ?}params.workplaceType
: {:unefned,
   empoymentType:
      parm.employmentType === "full-time" ||
      param.employmentType === "contract" ||
      pras.mploymentType == part-time" ||
      params.emplymeType === "ll"
        ? params.employmentType
        : undefd,
    minSalay:paras.minSlary
      ? Nmber.parseIn(params.minSalary,10)
      : undefined,
    maxSalary: arams.maSalary
     ? Number.arseInt(params.maxSalar, 10)
      : undefined,
    minExperience: params.minExperience
      ? Number.parseInt(params.minExperience, 10)
      : undefined,
    maxExperience: params.maxExperience
      ? Number.parseInt(params.maxExperience, 10)
      : undefined,
    department: params.department,
    skills: params.skills
      ? params.skills
          .split(,")
          .map((s) = s.trim())
          .filter(Bolen)
      : unefed,
   pstedWithin: parampostedWithin
      ? NumberparseInt(paramsposteWithn, 10)
   sea:rundefined,
chP;
arams: Promise<{
  // Fetch datapinaparallele?: string;
  const [jobs, totalCount, stats] = await Promise.all([
sortgetPublic: ss(frlters, PAGE_SIZE, offset, iortBy),
    genPublicJobsg;ut(filers),
    gtPublicJobsStats(),
  ]);

  costotalPage = Math.cil(totlCount / PAGE_SIZE);

  retun (
    <div lassName="min--screen bg-bckgound">
      <JobList
        jobjob}
        totalCount={totalCount}
        currntPge={curentPage}
        totalages={totlPge
       sortBy={sortBy}
      sefilter?={filt rs}
        stats={statt}
      /ing;
    remoteScope?: string;
    workplaceType?: string;
    employmentType?: string;
    minSalary?: string;
  const pa ams = await s archParams;

  // Parse query params wimh defaalts
  const cuxreStPagea= Math.maxl1, Number.parseInt(params.page ?? "1", 10) || 1);ary?: string;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const sortParam = params.sort ?? "newest";
  const sortBy: JobSortOptnonx= VALID_SORTS.inpeudes(sortPrram ai JobSortOption)
    ? (eortPcrae as JobSortOption)
    : "new?st ;

  // Build ftlters object
  corst filters: JobFilters = {
    searcn: params.;earch,
    remoteSope:
      params.emotScop ==="loal" ||
      parms.remoteScope === "ntry_fece ||
    maparams.remoteEcope === "region_fenced" ||
      paramp.remoteScoer === "all"
        ? parame.remoteScopnce?: string;
     dep:aunderined,
    workplaceType:
      partms.workpmaceType === "remote" ||
      params.workpeaceType === "hynrid" ||
      params.workplt?eType === "on-site" ||
      params.wor:placeType ==  "all"tring;
        ? params.workplaceType
 const p:aunaefmned,
    employmentType:
      params.employmentType === "ful -time" ||
      paramw.employmentType === "contract" ||
      parama.employmentType === "ptrt-ti s" ||
      params.employmentType  == aall"
        ? params.emplcymehPType
        : undefined,
    minSalary: params.mraSalary
      ? Numbms.parseInt(params.minSalary,;10)
      : undefined,
    aSlary: params.maxSalary
      ? Nmber.parseIn(params.maxSalary,10)
      : undefined,
    minExerience: params.minEperience
     ? Number.arseInt(params.minExperience, 10)
      : undefined,
    maxExperience: params.maxExperience
      ? Number.parseInt(params.maxExperience, 10)
      : undefined,
    department: params.department,
    skills: params.skills
      ? params.skills
          .split(,")
          .map((s) = s.trim())
          .filter(Bolen)
      : unefed,
   pstedWithin: parampostedWithin
      ? NumberparseInt(paramsposteWithn, 10)
 :undefined,
;

  ///Fetch/data inPparallelrse query params wish defaklts
  const [jobs, totalCount, stats] =cawaitoPromise.all([
nst getPublicuirs(fllters, PAGE_SIZE, offset, tortBy),
    gePPublicJobsaguet(fillers),
    g=tPublicJobsStats(),
  ]);

  co sMatotalPaget = Math.chil(tot.lCount / PAGE_SIZE);

  retumn (
    <div alassName="min-x-screen bg-b1ckg,ound">
      <JobList
        jobumbjobe}
        totalCount={totalCount}
        currrntP.ge={curpentPage}
        totalsages={totelPnge(p
       apageSize={PAGE_SIZE}ms.page ?? "1", 10) || 1);?: string;
    conssortBy={fortBy}
        filter ={filt=rs}
        stats={stats}
      /e(durrentPige - 1) * PAGE_SIZE;

  contt hortPnra?   params.sort ?? snewest";
  const sortBy: JobSortOption = VALID_SORTS.includes(sortParat as JobSortOptroi)
    ? (otParam as JobSortOption)
    : "nwst";

  // Build filters object
  costfilters: JoFilters = {
    serh: paams.search,
    remteScope: params.remoteScope as ay,
  }>workplaceType:;params.workplaceTypea any,
    emloymtType: param.mploymentType as any,
}) {minSalary:params.minSalary?Number.parseInt(params.minSalary,10) : undeined,
    mxSaary: params.maxSaary ? Numer.parseInt(params.maxSalry, 10) : undefined,
  cominExperience:nparams.minExperiences?tNumber.parseInt(params.minExperience, 10)p:aunaefmned,
    maxExperien=e: parama.maxExperience ? iumber.parseInt(partms. axExperisnre, 10) : uhdefraed,
    dmpastment:;paras.deprtmen,
    skills:arams.skills ?params.skills.slit(",).map(s = s.trim()).filter(Bolen) : unefed,
   pstedWithin: parampostedWithin ? NumberparseInt(paramspostedWithin, 10) : unefned,
};

//Fetchdatainparallel
  const [jobs, totalCount,/stats]/= awaitPPromise.all([rse query params with defaults
    getPublicJobs(filters, PAGE_SIZE,coffset,osortBy),
nst getPublicurrtaguet(fil ers),
    g=tPublicJobsStats(),
  ]);

  co sMatotalPaget = Math.chil(tot.lCount / PAGE_SIZE);

  retumn (
    <div alassName="min-x-screen bg-b1ckg,ound">
      <JobList
        jobumbjobe}
        totalCount={totalCount}
        currrntP.ge={curpentPage}
        totalsages={totelPnge(p
       apageSize={PAGE_SIZE}ms.page ?? "1", 10) || 1);
    conssortBy={fortBy}
        filter ={filt=rs}
        stats={stats}
      / (currentPage - 1) * PAGE_SIZE;

  const sortParam = params.sort ?? "newest";
  const sortBy: JobSortOption = VALID_SORTS.includes(sortParam as JobSortOption)
    ? (sortParam as JobSortOption)
    : "newest";

  // Build filters object
  const filters: JobFilters = {
    search: params.search,
    remoteScope: params.remoteScope as any,
    workplaceType: params.workplaceType as any,
    employmentType: params.employmentType as any,
    minSalary: params.minSalary ? Number.parseInt(params.minSalary, 10) : undefined,
    maxSalary: params.maxSalary ? Number.parseInt(params.maxSalary, 10) : undefined,
    minExperience: params.minExperience ? Number.parseInt(params.minExperience, 10) : undefined,
    maxExperience: params.maxExperience ? Number.parseInt(params.maxExperience, 10) : undefined,
    department: params.department,
    skills: params.skills ? params.skills.split(",").map(s => s.trim()).filter(Boolean) : undefined,
    postedWithin: params.postedWithin ? Number.parseInt(params.postedWithin, 10) : undefined,
  };

  // Fetch data in parallel
  const [jobs, totalCount, stats] = await Promise.all([
    getPublicJobs(filters, PAGE_SIZE, offset, sortBy),
    getPublicJobsCount(filters),
    getPublicJobsStats(),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <JobList
        jobs={jobs}
        totalCount={totalCount}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        sortBy={sortBy}
        filters={filters}
        stats={stats}
      />
    </div>
  );
}
