import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as isUUID } from 'uuid';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

import { Product, ProductImage } from './entities';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,

    @InjectRepository(ProductImage)
    private readonly productsImageRepository: Repository<ProductImage>,
  ) {}

  async create(createProductDto: CreateProductDto) {
    try {
      const { images = [], ...restProduct } = createProductDto;

      const product = this.productsRepository.create({
        ...restProduct,
        images: images.map((image) =>
          this.productsImageRepository.create({ url: image }),
        ),
      });

      await this.productsRepository.save(product);

      return { ...product, images };
    } catch (error) {
      this.handleDbException(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    return await this.productsRepository.find({
      take: limit,
      skip: offset,
      // TODO: relations
    });
  }

  async findOne(term: string) {
    let product: Product;

    if (isUUID(term)) {
      product = await this.productsRepository.findOneBy({ id: term });
    } else {
      const queryBuilder = this.productsRepository.createQueryBuilder();
      product = await queryBuilder
        .where(`UPPER(title)=:title or slug= :slug`, {
          title: term.toUpperCase(),
          slug: term.toLowerCase(),
        })
        .getOne();
    }

    if (!product) {
      throw new NotFoundException(`Product with id ${term} not found`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const product = await this.productsRepository.preload({
      id,
      ...updateProductDto,
      images: [],
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    try {
      await this.productsRepository.save(product);
      return product;
    } catch (error) {
      this.handleDbException(error);
    }
  }

  async remove(id: string) {
    const product = await this.findOne(id);

    await this.productsRepository.remove(product);
    return { message: 'Product deleted' };
  }

  private handleDbException(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException(error.detail);
    }

    // console.log(error);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
