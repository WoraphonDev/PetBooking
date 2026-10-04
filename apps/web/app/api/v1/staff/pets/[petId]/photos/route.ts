import { PhotosAddRequest } from "@app/contracts/endpoints/photos.add";
import { PhotosListQuery, PhotosListRequest } from "@app/contracts/endpoints/photos.list";
import { withStaff } from "@app/server/http";
import { photosAdd } from "@app/server/services/photos/add";
import { photosList } from "@app/server/services/photos/list";
export const GET = withStaff("photos.list", { params: PhotosListRequest, query: PhotosListQuery }, photosList);
export const POST = withStaff("photos.add", { params: PhotosListRequest, body: PhotosAddRequest }, photosAdd);
